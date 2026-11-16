# kotlinx.serialization: keep generated serializers of :core models.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class om.qabnah.core.** {
    *** Companion;
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class om.qabnah.core.**$$serializer { *; }
-keepclasseswithmembers class om.qabnah.core.** {
    kotlinx.serialization.KSerializer serializer(...);
}
# OkHttp / osmdroid
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
-dontwarn org.osmdroid.**
