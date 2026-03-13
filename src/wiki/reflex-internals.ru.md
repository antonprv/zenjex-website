# Reflex: внутреннее устройство

> **Language / Язык:** [English](Reflex-Internals) | [Русский](Reflex-Internals.ru)

## Содержание

- [Общая схема](#общая-схема)
- [Иерархия контейнеров](#иерархия-контейнеров)
- [ContainerBuilder](#containerbuilder)
- [Резолверы и лайфтаймы](#резолверы-и-лайфтаймы)
- [Активация объектов](#активация-объектов)
- [Кэш рефлексии](#кэш-рефлексии)
- [Пайплайн инъекции по атрибутам](#пайплайн-инъекции-по-атрибутам)
- [Bootstrap в Unity - UnityInjector](#bootstrap-в-unity---unityinjector)
- [ContainerScope](#containerscope)

---

## Общая схема

```
┌──────────────────────────────────────────────────────────┐
│                      Unity Runtime                       │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │                  Reflex (core DI)                   │ │
│  │                                                     │ │
│  │   ReflexSettings ──► RootContainer                  │ │
│  │                           │                         │ │
│  │                    SceneContainer (на сцену)        │ │
│  │                     наследует RootContainer         │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              Zenjex (extension layer)               │ │
│  │                                                     │ │
│  │  ProjectRootInstaller  ──► RootContext (static)     │ │
│  │  BindingBuilder (fluent Zenject-style API)          │ │
│  │  ZenjexRunner  ──► ZenjexInjector  ──► [Zenjex]     │ │
│  │  SceneInstaller (scene-scoped саб-контейнер)        │ │
│  │  ZenjexBehaviour (инъекция до Awake, гарантированно)│ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

Reflex управляет жизненным циклом контейнеров. Zenjex управляет оркестрацией инъекций и предоставляет совместимый с Zenject API поверх него. Слои развязаны: Zenjex обращается к Reflex только через `Container`, `ContainerBuilder` и `IInstaller`.

---

## Иерархия контейнеров

Reflex строит **дерево контейнеров «родитель - потомок»**. В типичном проекте два уровня:

- **RootContainer** - собирается один раз из `ReflexSettings.RootScopes` до загрузки любой сцены. Хранит биндинги, которые должны жить во всех сценах: глобальные сервисы, конфиги, фабрики. Доступен также как статическое поле `Container.RootContainer`.
- **SceneContainer** - создаётся как дочерняя область `RootContainer` каждый раз, когда загружается сцена с `ContainerScope`. Наследует все резолверы родителя, может добавлять и перекрывать локальные биндинги. Уничтожается при выгрузке сцены.

```
RootContainer
    └── SceneContainer (Scene A)
    └── SceneContainer (Scene B, additive)
```

При резолве тип ищется в собственном словаре `ResolversByContract`. Резолверы родителя **копируются** в потомка при сборке (`ContainerBuilder.Build()` делает shallow-copy из `Parent.ResolversByContract`), поэтому резолв всегда представляет собой один поиск по словарю без обхода родителей в рантайме.

---

## ContainerBuilder

`ContainerBuilder` - единственный способ создать `Container`. Он накапливает объекты `Binding` - каждый из них связывает `IResolver` с набором контрактов (типов) - а затем `Build()` материализует контейнер.

Ключевые шаги `Build()`:

1. Резолверы родителя сначала копируются в словарь нового контейнера, поэтому дочерние биндинги могут их перекрыть.
2. Поле `DeclaringContainer` каждого резолвера устанавливается в новый контейнер. Именно это обеспечивает привязку singleton-экземпляров к контейнеру, который их объявил, а не к тому, который запросил.
3. Унаследованные от родителя биндинги `Scoped + Eager` немедленно резолвятся в новом дочернем контейнере, создавая свежие scoped-экземпляры.
4. Собственные биндинги `Singleton/Scoped + Eager` тоже резолвятся немедленно. Всё остальное - ленивое по умолчанию.

У `ContainerBuilder` также есть два статических хука для инструментария: `OnRootContainerBuilding` и `OnSceneContainerBuilding`, которые `UnityInjector` вызывает при создании контейнеров.

---

## Резолверы и лайфтаймы

Каждый биндинг сопоставляется ровно с одним `IResolver`. Резолвер решает, создавать ли новый экземпляр или вернуть кэшированный. Существует семь типов:

| Резолвер | Лайфтайм | Поведение |
|---|---|---|
| `SingletonValueResolver` | Singleton | Оборачивает готовый экземпляр, всегда возвращает его |
| `SingletonTypeResolver` | Singleton | Создаёт экземпляр при первом резолве, кэширует в `DeclaringContainer` |
| `TransientTypeResolver` | Transient | Создаёт новый экземпляр при каждом резолве |
| `ScopedTypeResolver` | Scoped | Один экземпляр на область контейнера |
| `SingletonFactoryResolver` | Singleton | Вызывает фабричный делегат один раз, кэширует результат |
| `TransientFactoryResolver` | Transient | Вызывает фабрику при каждом резолве |
| `ScopedFactoryResolver` | Scoped | Вызывает фабрику один раз на область |

`Transient + Eager` запрещён на уровне assert - eagerly-созданный transient будет создан и сразу станет недостижимым, что не имеет смысла.

---

## Активация объектов

Когда резолверу типа нужно создать новый экземпляр, он вызывает `Container.Construct(type)`, который делегирует работу сначала `ConstructorInjector`, а затем `AttributeInjector`.

Приоритет при выборе конструктора:
1. Конструктор с атрибутом `[ReflexConstructor]`, если он есть.
2. Иначе - конструктор с наибольшим числом параметров.

На горячем пути Reflex **не использует** `Activator.CreateInstance` или `ConstructorInfo.Invoke` напрямую. Вместо этого при регистрации компилируется типизированный делегат через **`System.Linq.Expressions`**:

```csharp
// MonoActivatorFactory (Mono / Editor)
var lambda = Expression.Lambda<ObjectActivator>(
    Expression.Convert(Expression.New(constructor, argumentsExpressions), typeof(object)),
    param);
return lambda.Compile();
```

Скомпилированный делегат кэшируется в `TypeConstructionInfoCache` с ключом `Type.TypeHandle.Value` (сырой `IntPtr`), так что последующие обращения - это один поиск по словарю без накладных расходов на рефлексию.

На **IL2CPP** (AOT-платформы) `Expression.Compile()` недоступен. `IL2CPPActivatorFactory` откатывается к `FormatterServices.GetUninitializedObject` + `ConstructorInfo.Invoke` и полностью обходится без expression tree, но всё равно кэширует информацию о конструкции, чтобы не сканировать рефлексию повторно. `ActivatorFactoryManager` выбирает нужную фабрику при старте на основе scripting backend.

---

## Кэш рефлексии

Два кэша исключают повторное сканирование рефлексией:

**`TypeConstructionInfoCache`** - хранит `TypeConstructionInfo` на тип с ключом `TypeHandle.Value`. Каждая запись содержит скомпилированный делегат `ObjectActivator` и массив `MemberParamInfo[]` с описанием типов параметров конструктора и их значений по умолчанию. Строится лениво при первом вызове `Construct()` для данного типа.

**`TypeInfoCache`** - хранит `TypeAttributeInfo` на тип: списки полей, свойств и методов с атрибутом `[Inject]`. Строится лениво при первом вызове `AttributeInjector.Inject()`. Во время сканирования использует pooled-экземпляры `List<T>`, чтобы снизить аллокации.

Ни один из кэшей никогда не инвалидируется - Unity не перезагружает типы в рантайме.

---

## Пайплайн инъекции по атрибутам

После создания объекта `AttributeInjector.Inject(instance, container)` выполняет второй проход по членам с атрибутом `[Inject]`.

Если тип реализует `IAttributeInjectionContract`, вызов диспатчится напрямую в source-generated метод `ReflexInject(container)` - это нулевой по рефлексии быстрый путь, включаемый через `[SourceGeneratorInjectable]`. Диспатч инлайнится с `AggressiveInlining`. В противном случае инжектор читает из `TypeInfoCache` и вызывает:

- `FieldInjector` - задаёт поля через `FieldInfo.SetValue`
- `PropertyInjector` - задаёт свойства через `PropertyInfo.SetValue`
- `MethodInjector` - вызывает метод с резолвнутыми аргументами

---

## Bootstrap в Unity - UnityInjector

`UnityInjector` связывает Reflex с player loop Unity. Подключается через `[RuntimeInitializeOnLoadMethod(AfterAssembliesLoaded)]`, который срабатывает до загрузки любой сцены. Сборка помечена `[AlwaysLinkAssembly]`, чтобы код выполнился даже если сборка иначе была бы stripped.

Последовательность запуска:
1. Статическое состояние сбрасывается - это важно при отключённом **Reload Domain** в настройках редактора. Сброс обёрнут в `#if UNITY_EDITOR` и не выполняется в сборках.
2. Подписка на `OnSceneLoaded`, `SceneManager.sceneUnloaded` и `Application.quitting`.
3. При загрузке первой сцены: если `Container.RootContainer` равен null, он собирается из всех активных `RootScopes` в `ReflexSettings`, затем создаётся `SceneContainer` как дочерняя область.
4. При выгрузке сцены: соответствующий `SceneContainer` уничтожается и удаляется из `ContainersPerScene`.
5. При выходе из приложения: `RootContainer` уничтожается, всё статическое состояние и подписки на события очищаются.

`ContainersPerScene` - `Dictionary<Scene, Container>` для поиска нужного контейнера во время инъекции. Если в сцене окажется два компонента `ContainerScope`, будет брошен `SceneHasMultipleSceneScopesException`.

---

## ContainerScope

`ContainerScope` - `MonoBehaviour` с порядком выполнения `-1 000 000 000`, то есть гарантированно запускается раньше всего остального. Его `Awake()` вызывает `UnityInjector.OnSceneLoaded.Invoke(scene, this)`, что запускает создание контейнера и инъекцию по сцене до того, как в ней сработает любой другой `Awake()`. Важно: `Awake()` вызывается только для `ContainerScope`-экземпляров, размещённых в сценах - root scopes из `ReflexSettings` Unity никогда не инстанцирует.

`ContainerScope.InstallBindings(builder)` собирает все компоненты `IInstaller` на себе и дочерних объектах через `GetComponentsInChildren<IInstaller>()` с pooled `List<IInstaller>`, затем вызывает на каждом `InstallBindings`. Именно так `GameInstaller` (или любое количество инсталлеров) подхватывается автоматически.

`GameObjectSelfInjector` - вспомогательный `MonoBehaviour` (порядок `SceneContainerScopeExecutionOrder + 100`), который инъецирует один конкретный GameObject из контейнера сцены. Поддерживает три стратегии: `Single` (только данный компонент), `Object` (все компоненты на GameObject) и `Recursive` (полная иерархия). Нужен для объектов, которые не покрываются сценарным обходом.

---

← [Главная](Home.ru) | [Zenjex: внутреннее устройство](Zenjex-Internals.ru) →
