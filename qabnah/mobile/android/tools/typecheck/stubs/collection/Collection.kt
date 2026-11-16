package androidx.collection
// Only needed so desktop Compose class files that mention these types can be loaded by the compiler.
open class ScatterMap<K, V>
open class MutableScatterMap<K, V> : ScatterMap<K, V>()
open class ScatterSet<E>
open class MutableScatterSet<E> : ScatterSet<E>()
open class ObjectList<E>
open class MutableObjectList<E> : ObjectList<E>()
open class IntList
open class MutableIntList : IntList()
open class LongSparseArray<E>
open class SparseArrayCompat<E>
open class ArraySet<E>
open class SimpleArrayMap<K, V>
open class ArrayMap<K, V> : SimpleArrayMap<K, V>()
open class LruCache<K : Any, V : Any>(maxSize: Int)
open class IntIntMap
open class MutableIntIntMap : IntIntMap()
open class IntObjectMap<V>
open class MutableIntObjectMap<V> : IntObjectMap<V>()
open class ObjectIntMap<K>
open class MutableObjectIntMap<K> : ObjectIntMap<K>()
open class LongList
open class MutableLongList : LongList()
open class FloatList
open class MutableFloatList : FloatList()
open class IntSet
open class MutableIntSet : IntSet()
open class LongSet
open class MutableLongSet : LongSet()
