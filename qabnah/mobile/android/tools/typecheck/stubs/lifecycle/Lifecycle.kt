package androidx.lifecycle

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

abstract class Lifecycle {
    enum class Event { ON_CREATE, ON_START, ON_RESUME, ON_PAUSE, ON_STOP, ON_DESTROY, ON_ANY }
    enum class State { DESTROYED, INITIALIZED, CREATED, STARTED, RESUMED; fun isAtLeast(state: State): Boolean = compareTo(state) >= 0 }
    abstract fun addObserver(observer: LifecycleObserver)
    abstract fun removeObserver(observer: LifecycleObserver)
    abstract val currentState: State
    open val currentStateFlow: StateFlow<State> get() = MutableStateFlow(currentState)
}
interface LifecycleObserver
fun interface LifecycleEventObserver : LifecycleObserver { fun onStateChanged(source: LifecycleOwner, event: Lifecycle.Event) }
interface DefaultLifecycleObserver : LifecycleObserver
interface LifecycleOwner { val lifecycle: Lifecycle }
open class LifecycleRegistry(owner: LifecycleOwner) : Lifecycle() {
    override fun addObserver(observer: LifecycleObserver) {}
    override fun removeObserver(observer: LifecycleObserver) {}
    override var currentState: State = State.INITIALIZED
    open fun handleLifecycleEvent(event: Event) {}
}
val LifecycleOwner.lifecycleScope: CoroutineScope get() = TODO()
val Lifecycle.coroutineScope: CoroutineScope get() = TODO()

abstract class ViewModel {
    constructor()
    constructor(viewModelScope: CoroutineScope)
    constructor(vararg closeables: AutoCloseable)
    protected open fun onCleared() {}
    fun addCloseable(key: String, closeable: AutoCloseable) {}
    fun addCloseable(closeable: AutoCloseable) {}
    fun <T : AutoCloseable> getCloseable(key: String): T? = null
}
val ViewModel.viewModelScope: CoroutineScope get() = TODO()

open class ViewModelStore {
    fun clear() {}
    fun keys(): Set<String> = emptySet()
    fun put(key: String, viewModel: ViewModel) {}
    operator fun get(key: String): ViewModel? = null
}
interface ViewModelStoreOwner { val viewModelStore: ViewModelStore }
interface HasDefaultViewModelProviderFactory {
    val defaultViewModelProviderFactory: ViewModelProvider.Factory
    val defaultViewModelCreationExtras: androidx.lifecycle.viewmodel.CreationExtras get() = androidx.lifecycle.viewmodel.CreationExtras.Empty
}
open class ViewModelProvider {
    interface Factory {
        fun <T : ViewModel> create(modelClass: kotlin.reflect.KClass<T>, extras: androidx.lifecycle.viewmodel.CreationExtras): T = TODO()
        companion object
    }
    companion object {
        fun create(owner: ViewModelStoreOwner, factory: Factory = TODO(), extras: androidx.lifecycle.viewmodel.CreationExtras = TODO()): ViewModelProvider = TODO()
        fun create(store: ViewModelStore, factory: Factory = TODO(), extras: androidx.lifecycle.viewmodel.CreationExtras = TODO()): ViewModelProvider = TODO()
        val VIEW_MODEL_KEY: androidx.lifecycle.viewmodel.CreationExtras.Key<String> = TODO()
    }
    operator fun <T : ViewModel> get(modelClass: kotlin.reflect.KClass<T>): T = TODO()
    operator fun <T : ViewModel> get(key: String, modelClass: kotlin.reflect.KClass<T>): T = TODO()
}

class SavedStateHandle {
    constructor()
    constructor(initialState: Map<String, Any?>)
    operator fun <T> get(key: String): T? = null
    operator fun <T> set(key: String, value: T?) {}
    fun <T> getStateFlow(key: String, initialValue: T): StateFlow<T> = MutableStateFlow(initialValue)
    fun <T> getMutableStateFlow(key: String, initialValue: T): kotlinx.coroutines.flow.MutableStateFlow<T> = MutableStateFlow(initialValue)
    operator fun contains(key: String): Boolean = false
    fun keys(): Set<String> = emptySet()
    fun <T> remove(key: String): T? = null
}
fun androidx.lifecycle.viewmodel.CreationExtras.createSavedStateHandle(): SavedStateHandle = TODO()
val DEFAULT_ARGS_KEY: androidx.lifecycle.viewmodel.CreationExtras.Key<androidx.savedstate.SavedState> = TODO()
val SAVED_STATE_REGISTRY_OWNER_KEY: androidx.lifecycle.viewmodel.CreationExtras.Key<androidx.savedstate.SavedStateRegistryOwner> = TODO()
val VIEW_MODEL_STORE_OWNER_KEY: androidx.lifecycle.viewmodel.CreationExtras.Key<ViewModelStoreOwner> = TODO()
fun <T : androidx.savedstate.SavedStateRegistryOwner> T.enableSavedStateHandles() where T : ViewModelStoreOwner {}
