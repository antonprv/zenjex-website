# Reflex Internals

> **Language / Язык:** [English](Reflex-Internals) | [Русский](Reflex-Internals.ru)

## Table of Contents

- [High-level overview](#high-level-overview)
- [Container hierarchy](#container-hierarchy)
- [ContainerBuilder](#containerbuilder)
- [Resolvers and lifetimes](#resolvers-and-lifetimes)
- [Object activation](#object-activation)
- [Reflection cache](#reflection-cache)
- [Attribute injection pipeline](#attribute-injection-pipeline)
- [Unity bootstrap - UnityInjector](#unity-bootstrap---unityinjector)
- [ContainerScope](#containerscope)

---

## High-level overview

```
┌──────────────────────────────────────────────────────────┐
│                      Unity Runtime                       │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │                  Reflex (core DI)                   │ │
│  │                                                     │ │
│  │   ReflexSettings ──► RootContainer                  │ │
│  │                           │                         │ │
│  │                    SceneContainer (per scene)       │ │
│  │                     inherits from RootContainer     │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              Zenjex (extension layer)               │ │
│  │                                                     │ │
│  │  ProjectRootInstaller  ──► RootContext (static)     │ │
│  │  BindingBuilder (fluent Zenject-style API)          │ │
│  │  ZenjexRunner  ──► ZenjexInjector  ──► [Zenjex]     │ │
│  │  SceneInstaller (scene-scoped sub-container)        │ │
│  │  ZenjexBehaviour (guaranteed pre-Awake injection)   │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

Reflex owns the container lifecycle. Zenjex owns the injection orchestration and exposes a Zenject-compatible API on top. The two layers are decoupled - Zenjex talks to Reflex only through `Container`, `ContainerBuilder`, and `IInstaller`.

---

## Container hierarchy

Reflex uses a **parent-child container tree**. A typical setup has two levels:

- **RootContainer** - built once from `ReflexSettings.RootScopes` before any scene loads. Holds bindings that need to survive across all scenes: global services, configs, factories. Also stored as the static `Container.RootContainer`.
- **SceneContainer** - created as a child scope of `RootContainer` each time a scene with a `ContainerScope` loads. It inherits all resolvers from the parent, can add or override bindings locally, and is disposed when the scene unloads.

```
RootContainer
    └── SceneContainer (Scene A)
    └── SceneContainer (Scene B, additive)
```

When resolving a type, a container looks in its own `ResolversByContract` dictionary. Parent resolvers are **copied** into the child at build time (`ContainerBuilder.Build()` shallow-copies `Parent.ResolversByContract`), so resolution is always a single dictionary lookup with no runtime parent traversal.

---

## ContainerBuilder

`ContainerBuilder` is the only way to create a `Container`. It collects `Binding` objects - each one pairs an `IResolver` with a set of contracts (types) - then `Build()` materializes the container.

Key steps in `Build()`:

1. Parent resolvers are shallow-copied into the new container's dictionary first, so child bindings can shadow them.
2. Each resolver's `DeclaringContainer` is set to the new container. This is what keeps singleton instances scoped to the container that declared them, not the one that resolved them.
3. Inherited `Scoped + Eager` bindings from the parent are resolved immediately against the new child container, creating fresh scoped instances.
4. Self-owned `Singleton/Scoped + Eager` bindings are resolved immediately as well. Everything else is lazy by default.

`ContainerBuilder` also has two static extension hooks for tooling: `OnRootContainerBuilding` and `OnSceneContainerBuilding`, both invoked by `UnityInjector` during container creation.

---

## Resolvers and lifetimes

Every binding maps to exactly one `IResolver`. The resolver decides whether to create a new instance or return a cached one. There are seven types:

| Resolver | Lifetime | Behaviour |
|---|---|---|
| `SingletonValueResolver` | Singleton | Wraps a pre-existing instance, always returns it |
| `SingletonTypeResolver` | Singleton | Creates the instance on first resolve, caches it on `DeclaringContainer` |
| `TransientTypeResolver` | Transient | Creates a new instance on every resolve |
| `ScopedTypeResolver` | Scoped | Creates one instance per container scope |
| `SingletonFactoryResolver` | Singleton | Calls a factory delegate once, caches the result |
| `TransientFactoryResolver` | Transient | Calls the factory on every resolve |
| `ScopedFactoryResolver` | Scoped | Calls the factory once per scope |

`Transient + Eager` is forbidden at the assertion level - an eagerly created transient would be constructed and immediately become unreachable, which makes no sense.

---

## Object activation

When a type resolver needs to construct a new instance, it calls `Container.Construct(type)`, which delegates to `ConstructorInjector` and then `AttributeInjector`.

Constructor selection priority:
1. A constructor marked `[ReflexConstructor]`, if one exists.
2. The constructor with the most parameters otherwise.

On the hot path, Reflex does **not** use `Activator.CreateInstance` or bare `ConstructorInfo.Invoke`. Instead, it compiles a typed delegate at registration time using **`System.Linq.Expressions`**:

```csharp
// MonoActivatorFactory (Mono / Editor)
var lambda = Expression.Lambda<ObjectActivator>(
    Expression.Convert(Expression.New(constructor, argumentsExpressions), typeof(object)),
    param);
return lambda.Compile();
```

The compiled delegate is cached in `TypeConstructionInfoCache` keyed by `Type.TypeHandle.Value` (a raw `IntPtr`), so subsequent lookups are a single dictionary read with no reflection overhead.

On **IL2CPP** (AOT platforms), `Expression.Compile()` is unavailable. `IL2CPPActivatorFactory` falls back to `FormatterServices.GetUninitializedObject` + `ConstructorInfo.Invoke` and skips the expression tree entirely, but still caches the construction info to avoid repeated reflection scans. `ActivatorFactoryManager` picks the right factory at startup based on the scripting backend.

---

## Reflection cache

Two caches prevent repeated reflection scans:

**`TypeConstructionInfoCache`** - stores `TypeConstructionInfo` per type, keyed by `TypeHandle.Value`. Each entry holds the compiled `ObjectActivator` delegate and a `MemberParamInfo[]` describing constructor parameter types and default values. Built lazily on the first `Construct()` call per type.

**`TypeInfoCache`** - stores `TypeAttributeInfo` per type: lists of fields, properties, and methods carrying `[Inject]`. Built lazily on the first `AttributeInjector.Inject()` call. Uses pooled `List<T>` instances during the scanning pass to keep allocations down.

Neither cache ever invalidates - Unity does not hot-reload types at runtime.

---

## Attribute injection pipeline

After construction, `AttributeInjector.Inject(instance, container)` runs a second pass for `[Inject]`-marked members.

If the type implements `IAttributeInjectionContract`, the call dispatches directly to a source-generated `ReflexInject(container)` method - a zero-reflection fast path, opt-in via `[SourceGeneratorInjectable]`. The dispatch is inlined with `AggressiveInlining`. Otherwise the injector reads from `TypeInfoCache` and calls:

- `FieldInjector` - sets fields via `FieldInfo.SetValue`
- `PropertyInjector` - sets properties via `PropertyInfo.SetValue`
- `MethodInjector` - calls the method with resolved arguments

---

## Unity bootstrap - UnityInjector

`UnityInjector` is the entry point that connects Reflex to the Unity player loop. It hooks in via `[RuntimeInitializeOnLoadMethod(AfterAssembliesLoaded)]`, which fires before any scene loads. The assembly carries `[AlwaysLinkAssembly]` to ensure this runs even if the assembly would otherwise be stripped.

Startup sequence:
1. Static state is reset - this matters when **Reload Domain** is disabled in Editor settings. The reset is wrapped in `#if UNITY_EDITOR` so it does not run in builds.
2. `OnSceneLoaded`, `SceneManager.sceneUnloaded`, and `Application.quitting` are subscribed.
3. On the first scene load: if `Container.RootContainer` is null, it is built from all active `RootScopes` in `ReflexSettings`, then a `SceneContainer` is created as a child scope.
4. On scene unload: the corresponding `SceneContainer` is disposed and removed from `ContainersPerScene`.
5. On quit: `RootContainer` is disposed and all static state and event subscriptions are cleaned up.

`ContainersPerScene` is a `Dictionary<Scene, Container>` used to look up the right container during injection. If a scene has two `ContainerScope` components, `SceneHasMultipleSceneScopesException` is thrown.

---

## ContainerScope

`ContainerScope` is a `MonoBehaviour` with execution order `-1,000,000,000` - the lowest possible value, so it always runs before everything else. Its `Awake()` calls `UnityInjector.OnSceneLoaded.Invoke(scene, this)`, which triggers container creation and scene injection before any other `Awake()` in the scene. Note that `Awake()` is only invoked for `ContainerScope` instances placed in scenes - root scopes listed in `ReflexSettings` are never instantiated by Unity.

`ContainerScope.InstallBindings(builder)` collects all `IInstaller` components on itself and its children via `GetComponentsInChildren<IInstaller>()` using a pooled `List<IInstaller>`, then calls `InstallBindings` on each one. This is how a `GameInstaller` (or any number of installers) gets picked up automatically.

`GameObjectSelfInjector` is a companion `MonoBehaviour` (execution order `SceneContainerScopeExecutionOrder + 100`) that injects a single GameObject from the scene container. It supports three strategies: `Single` (this component only), `Object` (all components on the GameObject), and `Recursive` (the full hierarchy). Use it for objects not covered by scene-wide injection.

---

← [Home](Home) | [Zenjex Internals](Zenjex-Internals) →
