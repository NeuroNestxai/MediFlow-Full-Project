package androidx.annotation

@Retention(AnnotationRetention.BINARY)
@Target(AnnotationTarget.VALUE_PARAMETER, AnnotationTarget.FIELD, AnnotationTarget.PROPERTY, AnnotationTarget.FUNCTION, AnnotationTarget.LOCAL_VARIABLE)
annotation class DrawableRes

@Retention(AnnotationRetention.BINARY) annotation class RestrictTo(vararg val value: Scope) { enum class Scope { LIBRARY, LIBRARY_GROUP, LIBRARY_GROUP_PREFIX, TESTS, SUBCLASSES } }
@Retention(AnnotationRetention.BINARY) annotation class VisibleForTesting(val otherwise: Int = 2)
@Retention(AnnotationRetention.BINARY) annotation class MainThread
@Retention(AnnotationRetention.BINARY) annotation class FloatRange(val from: Double = 0.0, val to: Double = 0.0)
@Retention(AnnotationRetention.BINARY) annotation class IntRange(val from: Long = 0, val to: Long = 0)
@Retention(AnnotationRetention.BINARY) annotation class CallSuper
@Retention(AnnotationRetention.BINARY) annotation class GuardedBy(val value: String)
@Retention(AnnotationRetention.BINARY) annotation class ColorInt
