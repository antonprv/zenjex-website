# Zenjex: внутреннее устройство

> **Language / Язык:** [English](Zenjex-Internals) | [Русский](Zenjex-Internals.ru)

## Содержание

- [ProjectRootInstaller](#projectrootinstaller)
- [RootContext](#rootcontext)
- [BindingBuilder](#bindingbuilder)
- [ContainerBindingBuilder](#containerbindingbuilder)
- [IInitializable](#iinitializable)
- [ZenjexInjector](#zenjexinjector)
- [ZenjexRunner](#zenjexrunner)
- [ZenjexBehaviour](#zenjexbehaviour)
- [SceneInstaller](#sceneinstaller)
- [ZenjexSceneContext](#zenjexscenecontext)
- [Хронология выполнения](#хронология-выполнения)
- [Сводная таблица проходов инъекции](#сводная-таблица-проходов-инъекции)

---

## ProjectRootInstaller

`ProjectRootInstaller` - абстрактный `MonoBehaviour`, реализующий `IInstaller`. Это обязательная точка входа для всего слоя Zenjex. Запускается при `[DefaultExecutionOrder(-280)]`.

Нужно реализовать три абстрактных метода:

```
InstallBindings(ContainerBuilder)   - синхронный, заполняет глобальный контейнер
InstallGameInstanceRoutine()        - опциональная корутина, запускается после сборки контейнера
LaunchGame()                        - вызывается после инициализации IInitializable-сервисов
```

Порядок выполнения внутри `Awake`:

```
ProjectRootInstaller.Awake()
  ├─ new ContainerBuilder()
  ├─ InstallBindings(builder)          <- пользовательский код
  ├─ RootContainer = builder.Build()
  ├─ OnContainerReady?.Invoke()        <- здесь срабатывает Pass 1 ZenjexRunner
  └─ StartCoroutine(LateInitRoutine)
       ├─ yield return InstallGameInstanceRoutine()  <- опциональная асинхронная работа
       ├─ CallInitializables(RootContainer)          <- IInitializable.Initialize() для каждого зарегистрированного сервиса
       ├─ LaunchGame()                               <- пользовательский код
       └─ OnGameLaunched?.Invoke()     <- здесь срабатывает Pass 2 ZenjexRunner
```

`RootContainer` хранится как статическое свойство `ProjectRootInstaller`. Повторный вызов `Awake()` защищён guard-проверкой - актуально при отключённом Reload Domain.

`OnContainerReady` и `OnGameLaunched` - две точки синхронизации, через которые `ZenjexRunner` управляет проходами инъекции.

На практике биндинги обычно разносятся по нескольким дочерним `MonoInstaller`-компонентам:

```csharp
public class AppInstaller : ProjectRootInstaller
{
    [SerializeField] private InfrastructureInstaller _infra;
    [SerializeField] private GameplayInstaller       _gameplay;

    public override void InstallBindings(ContainerBuilder builder)
    {
        _infra.InstallBindings(builder);
        _gameplay.InstallBindings(builder);
    }

    public override IEnumerator InstallGameInstanceRoutine()
    {
        yield return _infra.LoadAddressablesRoutine();
    }

    public override void LaunchGame() { /* GSM запустится через IInitializable */ }
}
```

---

## RootContext

`RootContext` - тонкая статическая обёртка над `ProjectRootInstaller.RootContainer`. Нужна для того, чтобы пользовательский код не обращался к `ProjectRootInstaller` напрямую.

```csharp
public static class RootContext
{
    public static Container Runtime => ProjectRootInstaller.RootContainer;
    public static bool HasInstance   => ProjectRootInstaller.RootContainer != null;
    public static T Resolve<T>()     { ... }
    public static object Resolve(Type type) { ... }
}
```

`Runtime` открывает прямой доступ к контейнеру, что позволяет добавлять биндинги после инициализации через `RootContext.Runtime.Bind<T>()` - это extension-метод на `Container`, добавленный в `ContainerZenjectExtensions`. Оба перегруженных `Resolve` бросают `InvalidOperationException`, если контейнер ещё не был собран.

---

## BindingBuilder

`BindingBuilder<T>` - основа fluent-API Zenjex, воспроизводящего стиль Zenject. Получить его можно вызовом `builder.Bind<T>()` или `builder.BindInstance<T>(instance)` - это extension-методы на `ContainerBuilder`, объявленные в `ReflexZenjectExtensions`.

Общий паттерн: сначала модификаторы источника, контрактов и аргументов в любом порядке, затем терминатор лайфтайма.

### Модификаторы источника

| Метод | Описание |
|---|---|
| `.To<TConcrete>()` | Привязать интерфейс/базовый тип T к конкретной реализации |
| `.FromInstance(instance)` | Обернуть уже существующий экземпляр; всегда регистрируется как Singleton |
| `.FromComponentInNewPrefab(prefab)` | Заинстанцировать префаб при резолве и извлечь компонент; всегда Singleton + Lazy |
| `.FromComponentInHierarchy()` | Найти существующий компонент в иерархии загруженной сцены; всегда Singleton + Lazy |

У `FromComponentInNewPrefab` есть дополнительные модификаторы иерархии: `.WithGameObjectName(name)` переименовывает корневой GameObject, `.UnderTransformGroup(groupName)` помещает объект под именованную группу в корне сцены (создаётся автоматически, если отсутствует), `.UnderTransform(parent)` помещает его под конкретный `Transform`.

### Инъекция аргументов

`.WithArguments(params object[] args)` позволяет передать в конструктор явные аргументы, минуя контейнер. Каждое значение сопоставляется с параметром конструктора **по типу** (побеждает первое совпадение); параметры без совпадения резолвятся из контейнера в штатном режиме. Поведение идентично `WithArguments` в Zenject:

```csharp
builder.Bind<IInputService>()
       .To<InputService>()
       .WithArguments(playerInput, cinemachineInputProvider)
       .AsSingle();

// InputService(PlayerInput pi, CinemachineInputProvider cip, ILoggingService log)
// pi, cip <- WithArguments  |  log <- контейнер
```

### Модификаторы контрактов

| Метод | Описание |
|---|---|
| `.BindInterfaces()` | Зарегистрировать под всеми интерфейсами конкретного типа |
| `.BindInterfacesAndSelf()` | Зарегистрировать под всеми интерфейсами и самим конкретным типом |

### Поддержка саб-контейнеров

`.CopyIntoDirectSubContainers()` переключает биндинг на **Scoped** лайфтайм, так что внутри каждого `SceneInstaller`-саб-контейнера создаётся свежий экземпляр. Этот экземпляр получает в конструктор как глобальные зависимости (RootContainer), так и локальные для сцены (SceneInstaller):

```csharp
// Глобальный инсталлер:
builder.Bind<LevelProgressServiceResolver>()
       .BindInterfacesAndSelf()
       .CopyIntoDirectSubContainers()
       .NonLazy();
```

### Терминаторы лайфтайма

| Метод | Аналог в Zenject | Поведение |
|---|---|---|
| `.AsSingle()` | `.AsSingle()` | Lazy singleton |
| `.AsSingleton()` | - | Псевдоним для `AsSingle()` |
| `.NonLazy()` | `.AsSingle().NonLazy()` | Eager singleton - создаётся сразу при сборке контейнера |
| `.AsEagerSingleton()` | - | Псевдоним для `NonLazy()` |
| `.AsTransient()` | `.AsTransient()` | Новый экземпляр при каждом резолве |
| `.AsScoped()` | - | Один экземпляр на саб-контейнер (SceneInstaller) |

`Transient + Eager` явно запрещён - закоммиченный билдер бросит исключение на такой комбинации. Повторный вызов `Commit()` тоже бросает.

Если активен `.CopyIntoDirectSubContainers()`, вызовы `AsSingle()` и `NonLazy()` автоматически повышают лайфтайм до `Scoped`.

---

## ContainerBindingBuilder

`ContainerBindingBuilder<T>` используется для **пост-инициализационных биндингов** на живом `Container` через `RootContext.Runtime.Bind<T>()` (extension-метод из `ContainerZenjectExtensions`). Поддерживается только регистрация уже существующих экземпляров - зарегистрировать новый тип в уже собранном контейнере нельзя.

```csharp
RootContext.Runtime
    .Bind<ISomeService>()
    .FromInstance(myService)
    .BindInterfacesAndSelf()
    .AsSingle();
```

Вызов `AsSingle()` без предшествующего `FromInstance()` бросает `InvalidOperationException`.

---

## IInitializable

`IInitializable` - аналог одноимённого интерфейса из Zenject. Любой сервис, реализующий его, получит вызов `Initialize()` после того, как контейнер полностью собран и все зависимости внедрены, но до вызова `LaunchGame()`.

Порядок выполнения:
1. `Container.Build()` - все биндинги зарегистрированы
2. `OnContainerReady` - проход инъекции полей и свойств
3. `InstallGameInstanceRoutine()` - асинхронная настройка (Addressables и пр.)
4. **`IInitializable.Initialize()`** <- вы здесь
5. `LaunchGame()` - точка входа пользователя
6. `OnGameLaunched` - поздний проход инъекции

Чтобы сервис был обнаружен, его биндинг **обязательно** должен выставлять `IInitializable` как контракт - используйте `.BindInterfaces()` или `.BindInterfacesAndSelf()` в инсталлере. `ProjectRootInstaller` вызывает `Initialize()` внутри try/catch и логирует ошибки, не прерывая последовательность загрузки. `SceneInstaller` делает то же самое для scene-scoped сервисов.

---

## ZenjexInjector

`ZenjexInjector` - ядро механизма инъекции. Резолвит все члены, помеченные `[Zenjex]`, из `RootContext`. Вызывается автоматически как `ZenjexRunner`, так и `ZenjexBehaviour`.

Инжектор ведёт собственный кэш рефлексии (`Dictionary<Type, TypeZenjexInfo>`), в котором хранятся три массива на тип: `FieldInfo[]`, `PropertyInfo[]`, `MethodInfo[]`. Кэш строится лениво и проходит вверх по цепочке наследования (`t = t.BaseType`), подхватывая члены, объявленные в базовых классах - это важно для подклассов `ZenjexBehaviour`.

`HasZenjexMembers(Type)` - быстрая предварительная проверка, которую `ZenjexRunner` использует, чтобы пропустить `MonoBehaviour`-типы без `[Zenjex]`-членов, не создавая для них полную запись `TypeZenjexInfo`.

Ошибки инъекции на каждом члене перехватываются по отдельности и логируются через `Debug.LogError`, так что один неудавшийся резолв не блокирует остальную часть прохода.

---

## ZenjexRunner

`ZenjexRunner` - оркестратор инъекции на уровне всей сцены. Статический класс, который инициализируется через `[RuntimeInitializeOnLoadMethod(BeforeSceneLoad)]` и подписывается на два события `ProjectRootInstaller` и `SceneManager.sceneLoaded`.

Внутреннее состояние:
- `_injected: HashSet<int>` - instance ID уже обработанных объектов, защита от двойной инъекции
- `_launched: bool` - был ли уже вызван `OnGameLaunched` (публично доступен как `IsReady`)
- `InjectedRecords: List<InjectedRecord>` - лог всех выполненных инъекций, используется окном отладчика
- `OnStateChanged: event Action` - срабатывает после каждого прохода инъекции или ручного вызова

**Pass 1 - `OnContainerReady`** (срабатывает синхронно внутри `ProjectRootInstaller.Awake()` при порядке `-280`):
Обходит все загруженные сцены через `SceneManager.GetSceneAt(i)`, собирает все `MonoBehaviour`-компоненты включая неактивные, проверяет `HasZenjexMembers` и вызывает `ZenjexInjector.Inject`. Поскольку это происходит при порядке `-280`, каждый последующий `Awake()` в сцене уже увидит заполненные поля.

**Pass 2 - `OnGameLaunched`** (срабатывает после завершения `InstallGameInstanceRoutine()` и `IInitializable.Initialize()`):
Повторяет тот же обход сцены. Покрывает объекты, зависимости которых были зарегистрированы в `InstallGameInstanceRoutine` и потому не могли быть резолвнуты в Pass 1. Устанавливает `_launched = true`.

**Pass 3 - `SceneManager.sceneLoaded`** (срабатывает для каждой аддитивно загруженной сцены после запуска):
Тот же обход, но для сцен, загруженных позже. Любой `MonoBehaviour`, инъецированный в этом проходе, уже выполнил свой `Awake()` до инъекции - раннер выдаёт предупреждение `ZNX-LATE`. Чтобы избежать этого, используйте `ZenjexBehaviour`.

**Pass 4 - `InjectGameObject(GameObject go)`** (ручной, runtime):
Вызывается сразу после `Instantiate()` для динамически созданных объектов. Если вызвать до `LaunchGame()`, вызов будет проигнорирован и выдано предупреждение.

```csharp
var enemy = Instantiate(enemyPrefab);
ZenjexRunner.InjectGameObject(enemy);
```

**Защита от двойной инъекции**: `ZenjexBehaviour.Awake()` вызывает `ZenjexRunner.MarkInjected(this)` после того, как сам выполнил инъекцию. Раннер пропускает instance ID, уже присутствующий в `_injected`, так что двойного резолва между базовым классом и проходами раннера не возникает.

Каждая инъекция записывается в `InjectedRecords` как `InjectedRecord` (имя типа, имя GameObject, имя сцены, номер прохода, флаг опоздания) для окна отладчика.

---

## ZenjexBehaviour

`ZenjexBehaviour` - абстрактный `MonoBehaviour` с `[DefaultExecutionOrder(-100)]`. Даёт наиболее строгую гарантию по времени инъекции: поля заполняются в собственном `Awake()`, до запуска любого `Awake()` с порядком по умолчанию. В отличие от проходов раннера, это работает и для префабов, созданных через `Instantiate()`, - порядок выполнения применяется к любому активному `MonoBehaviour` вне зависимости от того, как он попал в сцену.

Если `RootContext.HasInstance` возвращает false в момент вызова `Awake()` (контейнер ещё не собран), инъекция пропускается и выдаётся предупреждение; `OnAwake()` при этом всё равно вызывается.

Пример использования:

```csharp
public class MyController : ZenjexBehaviour
{
    [Zenjex] private IMyService _service;

    protected override void OnAwake()
    {
        // _service уже доступен здесь
    }
}
```

`OnAwake()` - `protected virtual` метод. Подклассам больше не нужно вызывать `base.OnAwake()` - `ZenjexRunner.MarkInjected` вызывается напрямую в `ZenjexBehaviour.Awake()` до того, как выполняется `OnAwake()`. Вызов `base.OnAwake()` в подклассе безвреден (базовая реализация пустая), но не обязателен.

`SceneInstaller` тоже наследует `ZenjexBehaviour` (с порядком `-200`), чтобы получить глобальные `[Zenjex]`-инъекции до того, как начнёт строить контейнер сцены.

---

## SceneInstaller

`SceneInstaller` - абстрактный `MonoBehaviour`, наследующий `ZenjexBehaviour`, с `[DefaultExecutionOrder(-200)]`. Аналог `SceneContext` из Zenject. Размещается в каждой игровой сцене на любом GameObject.

Создаёт **дочерний контейнер**, наследующий все глобальные биндинги из `ProjectRootInstaller.RootContainer`, и добавляет к ним локальные биндинги сцены:

```
RootContainer  (глобальный, ProjectRootInstaller)
    └── SceneContainer  (для сцены, SceneInstaller)
```

Жизненный цикл внутри `OnAwake()` (порядок `-200`, после `ProjectRootInstaller` с порядком `-280`):

```
SceneInstaller.OnAwake()
  ├─ RootContext.Runtime.Scope(InstallBindings)  <- создаётся дочерний контейнер
  ├─ ZenjexSceneContext.Register(scene, container)
  ├─ CallInitializables(SceneContainer)          <- IInitializable для scene-local сервисов
  ├─ OnSceneContainerReady?.Invoke(container)
  └─ OnInstalled()                               <- опциональный override
```

Дочерний контейнер уничтожается в `OnDestroy()` при выгрузке сцены, что автоматически вызывает `IDisposable.Dispose()` на всех scoped-экземплярах.

```csharp
public class GameplaySceneInstaller : SceneInstaller
{
    [SerializeField] private LevelProgressWatcher levelProgressWatcher;

    public override void InstallBindings(ContainerBuilder builder)
    {
        builder.BindInstance(levelProgressWatcher).AsSingle();

        builder.Bind<LevelProgressServiceResolver>()
               .BindInterfacesAndSelf()
               .CopyIntoDirectSubContainers()
               .NonLazy();
    }
}
```

Любой глобальный биндинг с `.CopyIntoDirectSubContainers()` (Scoped лайфтайм) будет заново создан внутри контейнера этой сцены и сможет получить как глобальные, так и локальные зависимости.

---

## ZenjexSceneContext

`ZenjexSceneContext` - статический реестр scene-scoped контейнеров. `SceneInstaller` заполняет и очищает его автоматически.

```csharp
// Резолвнуть из последнего загруженного контейнера сцены:
ZenjexSceneContext.Resolve<LevelProgressWatcher>();

// Получить сам контейнер для нескольких резолвов:
var container = ZenjexSceneContext.GetActive();

// Получить контейнер конкретной сцены:
var container = ZenjexSceneContext.Get(scene);

// Проверить наличие активного контейнера:
if (ZenjexSceneContext.HasActiveScene) { ... }
```

Контейнеры хранятся в `Dictionary<int, Container>` с ключом `Scene.handle`. `GetActive()` возвращает контейнер, зарегистрированный последним загруженным `SceneInstaller`; `Get(scene)` позволяет адресовать конкретную сцену напрямую.

---

## Хронология выполнения

```
Запуск приложения
│
├─ [RuntimeInitializeOnLoadMethod: AfterAssembliesLoaded]
│     UnityInjector.Initialize()
│
├─ [RuntimeInitializeOnLoadMethod: BeforeSceneLoad]
│     ZenjexRunner.Initialize()
│
Загрузка сцены
│
├─ ContainerScope.Awake()  (порядок: -1 000 000 000)
│     UnityInjector создаёт SceneContainer как дочерний к RootContainer
│
├─ ProjectRootInstaller.Awake()  (порядок: -280)
│     InstallBindings(builder)
│     RootContainer = builder.Build()
│     OnContainerReady.Invoke()
│        └─ ZenjexRunner Pass 1: инъекция всех [Zenjex]-объектов сцены
│     StartCoroutine(LateInitRoutine)
│
├─ SceneInstaller.OnAwake()  (порядок: -200)  [подкласс ZenjexBehaviour]
│     ZenjexInjector.Inject(this)        <- заполняются глобальные [Zenjex]-поля
│     ZenjexRunner.MarkInjected(this)
│     RootContext.Runtime.Scope(InstallBindings) <- создаётся контейнер сцены
│     CallInitializables(SceneContainer)
│     OnSceneContainerReady.Invoke(SceneContainer)
│
├─ ZenjexBehaviour.Awake()  (порядок: -100)  [для каждого ZenjexBehaviour в сцене]
│     ZenjexInjector.Inject(this)
│     ZenjexRunner.MarkInjected(this)
│     OnAwake()
│
├─ MonoBehaviour.Awake()  (порядок: 0, по умолчанию)
│     [Zenjex]-поля уже заполнены из Pass 1
│
└─ LateInitRoutine (корутина, запускается после yield)
      InstallGameInstanceRoutine()    <- опциональная асинхронная инициализация
      CallInitializables(RootContainer) <- IInitializable.Initialize()
      LaunchGame()                    <- точка входа в игру
      OnGameLaunched.Invoke()
         └─ ZenjexRunner Pass 2: повторный обход для биндингов, добавленных в async init
```

---

## Сводная таблица проходов инъекции

| Проход | Триггер | До `Awake()`? | Предупреждение ZNX-LATE? |
|---|---|---|---|
| Pass 1 | `OnContainerReady` (внутри `ProjectRootInstaller.Awake` при порядке -280) | Да | Нет |
| Pass 2 | `OnGameLaunched` (после корутины + `IInitializable`) | Нет | Нет |
| Pass 3 | `SceneManager.sceneLoaded` (аддитивные сцены) | Нет | **Да** |
| Pass 4 | `ZenjexRunner.InjectGameObject()` (вручную, runtime) | Нет | Нет |
| `ZenjexBehaviour` | Собственный `Awake()` при порядке -100 | Да | Нет |
| `SceneInstaller` | Собственный `OnAwake()` при порядке -200 (подкласс ZenjexBehaviour) | Да | Нет |

---

← [Reflex: внутреннее устройство](Reflex-Internals.ru) | [Главная](Home.ru)
