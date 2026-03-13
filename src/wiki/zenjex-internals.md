# Zenjex Internals

> **Language / Язык:** [English](Zenjex-Internals) | [Русский](Zenjex-Internals.ru)

## Table of Contents

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
- [Execution timeline](#execution-timeline)
- [Injection pass summary](#injection-pass-summary)

---

## ProjectRootInstaller

`ProjectRootInstaller` is an abstract `MonoBehaviour` that implements `IInstaller` and serves as the mandatory entry point for the Zenjex layer. It runs at `[DefaultExecutionOrder(-280)]`.

Three abstract methods need to be implemented:

```
InstallBindings(ContainerBuilder)   - synchronous, fills the global container
InstallGameInstanceRoutine()        - optional coroutine, runs after the container is built
LaunchGame()                        - called after IInitializable services are initialized
```

Internal `Awake` flow:

```
ProjectRootInstaller.Awake()
  ├─ new ContainerBuilder()
  ├─ InstallBindings(builder)          <- user code
  ├─ RootContainer = builder.Build()
  ├─ OnContainerReady?.Invoke()        <- ZenjexRunner Pass 1 fires here
  └─ StartCoroutine(LateInitRoutine)
       ├─ yield return InstallGameInstanceRoutine()  <- optional async work
       ├─ CallInitializables(RootContainer)          <- IInitializable.Initialize() on every registered service
       ├─ LaunchGame()                               <- user code
       └─ OnGameLaunched?.Invoke()     <- ZenjexRunner Pass 2 fires here
```

`RootContainer` is stored as a static property on `ProjectRootInstaller`. There is a guard that prevents re-initialization if `Awake()` gets called again - this can happen when Reload Domain is disabled.

`OnContainerReady` and `OnGameLaunched` are the two synchronization points that `ZenjexRunner` uses to orchestrate injection passes.

In practice, bindings are usually split across multiple child `MonoInstaller` components:

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

    public override void LaunchGame() { /* GSM will start via IInitializable */ }
}
```

---

## RootContext

`RootContext` is a thin static wrapper over `ProjectRootInstaller.RootContainer`. It exists so that user code does not need to reference `ProjectRootInstaller` directly.

```csharp
public static class RootContext
{
    public static Container Runtime => ProjectRootInstaller.RootContainer;
    public static bool HasInstance   => ProjectRootInstaller.RootContainer != null;
    public static T Resolve<T>()     { ... }
    public static object Resolve(Type type) { ... }
}
```

`Runtime` gives direct access to the container, which makes post-initialization binding possible via `RootContext.Runtime.Bind<T>()` - an extension method on `Container` added by `ContainerZenjectExtensions`. Both `Resolve` overloads throw `InvalidOperationException` if the container has not been built yet.

---

## BindingBuilder

`BindingBuilder<T>` is the backbone of Zenjex's Zenject-like fluent API. You get one by calling `builder.Bind<T>()` or `builder.BindInstance<T>(instance)` - extension methods on `ContainerBuilder` defined in `ReflexZenjectExtensions`.

The general pattern is: chain source modifiers, contract modifiers, and argument modifiers in any order, then finish with a lifetime method.

### Source modifiers

| Method | Description |
|---|---|
| `.To<TConcrete>()` | Bind interface/base T to a concrete implementation |
| `.FromInstance(instance)` | Wrap a pre-existing instance; always registers as Singleton |
| `.FromComponentInNewPrefab(prefab)` | Instantiate a prefab at resolve-time and extract the component; always Singleton + Lazy |
| `.FromComponentInHierarchy()` | Find an existing component in the loaded scene; always Singleton + Lazy |

`FromComponentInNewPrefab` has additional hierarchy modifiers: `.WithGameObjectName(name)` renames the root GameObject, `.UnderTransformGroup(groupName)` places the instance under a named scene-root group (created automatically if absent), and `.UnderTransform(parent)` places it under a specific `Transform`.

### Argument injection

`.WithArguments(params object[] args)` lets you pass explicit constructor arguments that bypass the container. Each value is matched to a constructor parameter **by type** (first match wins); parameters with no match are resolved from the container normally. This mirrors Zenject's `WithArguments`:

```csharp
builder.Bind<IInputService>()
       .To<InputService>()
       .WithArguments(playerInput, cinemachineInputProvider)
       .AsSingle();

// InputService(PlayerInput pi, CinemachineInputProvider cip, ILoggingService log)
// pi, cip <- WithArguments  |  log <- container
```

### Contract modifiers

| Method | Description |
|---|---|
| `.BindInterfaces()` | Register under all interfaces of the concrete type |
| `.BindInterfacesAndSelf()` | Register under all interfaces and the concrete type itself |

### Sub-container support

`.CopyIntoDirectSubContainers()` switches the binding to **Scoped** lifetime, so a fresh instance is created inside each `SceneInstaller` sub-container. That instance gets both global (RootContainer) and scene-local (SceneInstaller) dependencies in its constructor:

```csharp
// Global installer:
builder.Bind<LevelProgressServiceResolver>()
       .BindInterfacesAndSelf()
       .CopyIntoDirectSubContainers()
       .NonLazy();
```

### Lifetime terminators

| Method | Zenject equivalent | Behaviour |
|---|---|---|
| `.AsSingle()` | `.AsSingle()` | Lazy singleton |
| `.AsSingleton()` | - | Alias for `AsSingle()` |
| `.NonLazy()` | `.AsSingle().NonLazy()` | Eager singleton - constructed immediately when the container is built |
| `.AsEagerSingleton()` | - | Alias for `NonLazy()` |
| `.AsTransient()` | `.AsTransient()` | New instance on every resolve |
| `.AsScoped()` | - | One instance per sub-container (SceneInstaller) |

`Transient + Eager` is explicitly forbidden - a committed builder throws on this combination. Calling `Commit()` twice also throws.

When `.CopyIntoDirectSubContainers()` is set, `AsSingle()` and `NonLazy()` automatically promote the lifetime to `Scoped`.

---

## ContainerBindingBuilder

`ContainerBindingBuilder<T>` is used for **post-initialization binding** on a live `Container` via `RootContext.Runtime.Bind<T>()` (extension method from `ContainerZenjectExtensions`). It only supports registering pre-existing instances - registering new types into an already-built container is not possible.

```csharp
RootContext.Runtime
    .Bind<ISomeService>()
    .FromInstance(myService)
    .BindInterfacesAndSelf()
    .AsSingle();
```

Calling `AsSingle()` without a prior `FromInstance()` throws `InvalidOperationException`.

---

## IInitializable

`IInitializable` is a drop-in replacement for Zenject's `IInitializable`. Any service that implements it will receive a `Initialize()` call after the container is fully built and all dependencies are injected, but before `LaunchGame()` runs.

Execution order:
1. `Container.Build()` - all bindings registered
2. `OnContainerReady` - field/property injection pass
3. `InstallGameInstanceRoutine()` - async setup (Addressables, etc.)
4. **`IInitializable.Initialize()`** <- you are here
5. `LaunchGame()` - user entry-point
6. `OnGameLaunched` - late injection pass

For the service to be discovered, its binding **must** expose `IInitializable` as a contract - use `.BindInterfaces()` or `.BindInterfacesAndSelf()` in the installer. `ProjectRootInstaller` calls `Initialize()` inside a try/catch and logs errors without interrupting the boot sequence. `SceneInstaller` does the same for scene-scoped services.

---

## ZenjexInjector

`ZenjexInjector` is the core injection engine. It resolves all `[Zenjex]`-marked members on a target object from `RootContext`. It is called automatically by both `ZenjexRunner` and `ZenjexBehaviour`.

The injector has its own reflection cache (`Dictionary<Type, TypeZenjexInfo>`) that stores three arrays per type: `FieldInfo[]`, `PropertyInfo[]`, `MethodInfo[]`. The cache is built lazily and walks the full inheritance chain (`t = t.BaseType`) to pick up members declared in base classes - this is important for `ZenjexBehaviour` subclasses.

`HasZenjexMembers(Type)` is a fast pre-check that `ZenjexRunner` uses to skip `MonoBehaviour` types with no `[Zenjex]` members, without building a full `TypeZenjexInfo` entry for them.

Injection errors per member are caught individually and logged via `Debug.LogError`, so one failed resolve does not block the rest of the injection pass.

---

## ZenjexRunner

`ZenjexRunner` is the scene-wide injection orchestrator. It is a static class that initializes via `[RuntimeInitializeOnLoadMethod(BeforeSceneLoad)]` and subscribes to the two `ProjectRootInstaller` events and `SceneManager.sceneLoaded`.

Internal state:
- `_injected: HashSet<int>` - instance IDs of already-injected objects, guards against double injection
- `_launched: bool` - whether `OnGameLaunched` has fired (exposed publicly as `IsReady`)
- `InjectedRecords: List<InjectedRecord>` - a log of every injection, consumed by the debugger window
- `OnStateChanged: event Action` - fires after each injection pass or after a manual inject call

**Pass 1 - `OnContainerReady`** (fires synchronously inside `ProjectRootInstaller.Awake()` at order `-280`):
Walks all loaded scenes via `SceneManager.GetSceneAt(i)`, collects all `MonoBehaviour` components including inactive ones, checks `HasZenjexMembers`, then calls `ZenjexInjector.Inject`. Since this runs at order `-280`, every `Awake()` that follows will already see populated fields.

**Pass 2 - `OnGameLaunched`** (fires after `InstallGameInstanceRoutine()` and `IInitializable.Initialize()` complete):
Repeats the same scene walk. This catches objects whose dependencies were registered during `InstallGameInstanceRoutine` and could not be resolved in Pass 1. Sets `_launched = true`.

**Pass 3 - `SceneManager.sceneLoaded`** (fires for each additively loaded scene after launch):
Same walk, targeting late-arriving scenes. Any `MonoBehaviour` injected here already had its `Awake()` run before injection - the runner emits a `ZNX-LATE` warning. Use `ZenjexBehaviour` to avoid this.

**Pass 4 - `InjectGameObject(GameObject go)`** (manual, runtime):
Call right after `Instantiate()` for dynamically spawned objects. If called before `LaunchGame()`, the call is skipped and a warning is emitted.

```csharp
var enemy = Instantiate(enemyPrefab);
ZenjexRunner.InjectGameObject(enemy);
```

**Double-injection protection**: `ZenjexBehaviour.Awake()` calls `ZenjexRunner.MarkInjected(this)` after injecting itself. The runner skips any instance ID already in `_injected`, so there is no chance of a double resolve between the base class and the runner passes.

Every injection is recorded in `InjectedRecords` as an `InjectedRecord` (type name, GameObject name, scene name, pass, late flag) for the debugger window.

---

## ZenjexBehaviour

`ZenjexBehaviour` is an abstract `MonoBehaviour` running at `[DefaultExecutionOrder(-100)]`. It gives the strongest injection timing guarantee available: fields are injected inside its own `Awake()`, before any default-order `Awake()` runs. Unlike the runner passes, it also works on prefabs spawned via `Instantiate()`, since execution order applies to any active `MonoBehaviour` regardless of how it arrived in the scene.

If `RootContext.HasInstance` is false when `Awake()` runs (the container is not built yet), injection is skipped and a warning is logged; `OnAwake()` still fires.

Usage:

```csharp
public class MyController : ZenjexBehaviour
{
    [Zenjex] private IMyService _service;

    protected override void OnAwake()
    {
        // _service is already injected here
    }
}
```

`OnAwake()` is a `protected virtual` method. Subclasses no longer need to call `base.OnAwake()` - `ZenjexRunner.MarkInjected` is called directly in `ZenjexBehaviour.Awake()` before `OnAwake()` is invoked. Calling `base.OnAwake()` in a subclass is harmless (the base implementation is empty) but not required.

`SceneInstaller` also extends `ZenjexBehaviour` (at order `-200`) so it can receive global `[Zenjex]` injections before it builds the scene container.

---

## SceneInstaller

`SceneInstaller` is an abstract `MonoBehaviour` that extends `ZenjexBehaviour` and runs at `[DefaultExecutionOrder(-200)]`. It is the Zenjex equivalent of Zenject's `SceneContext`. Place one per gameplay scene on any GameObject.

It creates a **child container** that inherits all global bindings from `ProjectRootInstaller.RootContainer` and adds scene-local bindings on top:

```
RootContainer  (global, ProjectRootInstaller)
    └── SceneContainer  (per-scene, SceneInstaller)
```

Lifecycle inside `OnAwake()` (runs at order `-200`, after `ProjectRootInstaller` at `-280`):

```
SceneInstaller.OnAwake()
  ├─ RootContext.Runtime.Scope(InstallBindings)  <- creates child container
  ├─ ZenjexSceneContext.Register(scene, container)
  ├─ CallInitializables(SceneContainer)          <- IInitializable on scene-local services
  ├─ OnSceneContainerReady?.Invoke(container)
  └─ OnInstalled()                               <- optional override
```

The child container is disposed in `OnDestroy()` when the scene unloads, which triggers `IDisposable.Dispose()` on all scoped instances.

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

Any global binding marked with `.CopyIntoDirectSubContainers()` (Scoped lifetime) will be freshly instantiated inside this scene's container and can receive both global and scene-local dependencies.

---

## ZenjexSceneContext

`ZenjexSceneContext` is a static registry of scene-scoped containers. `SceneInstaller` populates and cleans it up automatically.

```csharp
// Resolve from the most recently loaded scene container:
ZenjexSceneContext.Resolve<LevelProgressWatcher>();

// Get the container itself for multiple lookups:
var container = ZenjexSceneContext.GetActive();

// Get a container for a specific scene:
var container = ZenjexSceneContext.Get(scene);

// Guard before resolving:
if (ZenjexSceneContext.HasActiveScene) { ... }
```

Internally, containers are stored in a `Dictionary<int, Container>` keyed by `Scene.handle`. `GetActive()` returns the container from the most recently loaded `SceneInstaller`; `Get(scene)` lets you target a specific scene directly.

---

## Execution timeline

```
Application start
│
├─ [RuntimeInitializeOnLoadMethod: AfterAssembliesLoaded]
│     UnityInjector.Initialize()
│
├─ [RuntimeInitializeOnLoadMethod: BeforeSceneLoad]
│     ZenjexRunner.Initialize()
│
Scene loads
│
├─ ContainerScope.Awake()  (order: -1,000,000,000)
│     UnityInjector creates SceneContainer as child of RootContainer
│
├─ ProjectRootInstaller.Awake()  (order: -280)
│     InstallBindings(builder)
│     RootContainer = builder.Build()
│     OnContainerReady.Invoke()
│        └─ ZenjexRunner Pass 1: injects all [Zenjex] scene objects
│     StartCoroutine(LateInitRoutine)
│
├─ SceneInstaller.OnAwake()  (order: -200)  [ZenjexBehaviour subclass]
│     ZenjexInjector.Inject(this)        <- global [Zenjex] fields filled
│     ZenjexRunner.MarkInjected(this)
│     RootContext.Runtime.Scope(InstallBindings) <- scene container created
│     CallInitializables(SceneContainer)
│     OnSceneContainerReady.Invoke(SceneContainer)
│
├─ ZenjexBehaviour.Awake()  (order: -100)  [for each ZenjexBehaviour in scene]
│     ZenjexInjector.Inject(this)
│     ZenjexRunner.MarkInjected(this)
│     OnAwake()
│
├─ MonoBehaviour.Awake()  (order: 0, default)
│     [Zenjex] fields already populated from Pass 1
│
└─ LateInitRoutine (coroutine, runs after yielding)
      InstallGameInstanceRoutine()    <- optional async initialization
      CallInitializables(RootContainer) <- IInitializable.Initialize()
      LaunchGame()                    <- game entry point
      OnGameLaunched.Invoke()
         └─ ZenjexRunner Pass 2: re-scans scene for bindings added during async init
```

---

## Injection pass summary

| Pass | Trigger | Fires before `Awake()`? | ZNX-LATE warning? |
|---|---|---|---|
| Pass 1 | `OnContainerReady` (inside `ProjectRootInstaller.Awake` at -280) | Yes | No |
| Pass 2 | `OnGameLaunched` (after coroutine + `IInitializable`) | No | No |
| Pass 3 | `SceneManager.sceneLoaded` (additive scenes) | No | **Yes** |
| Pass 4 | `ZenjexRunner.InjectGameObject()` (manual, runtime) | No | No |
| `ZenjexBehaviour` | Own `Awake()` at order -100 | Yes | No |
| `SceneInstaller` | Own `OnAwake()` at order -200 (ZenjexBehaviour subclass) | Yes | No |

---

← [Reflex Internals](Reflex-Internals) | [Home](Home)
