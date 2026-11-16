package om.qabnah.core

object Fixtures {
    fun read(name: String): String =
        requireNotNull(Fixtures::class.java.getResource("/fixtures/$name")) { "missing fixture $name" }.readText()
}
