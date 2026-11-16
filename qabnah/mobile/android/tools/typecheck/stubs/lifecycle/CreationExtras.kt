package androidx.lifecycle.viewmodel

abstract class CreationExtras {
    interface Key<T>
    abstract operator fun <T> get(key: Key<T>): T?
    object Empty : CreationExtras() { override fun <T> get(key: Key<T>): T? = null }
}
open class MutableCreationExtras(initialExtras: CreationExtras = CreationExtras.Empty) : CreationExtras() {
    operator fun <T> set(key: Key<T>, t: T) {}
    override fun <T> get(key: Key<T>): T? = null
}
class InitializerViewModelFactoryBuilder
fun viewModelFactory(builder: InitializerViewModelFactoryBuilder.() -> Unit): androidx.lifecycle.ViewModelProvider.Factory = TODO()
