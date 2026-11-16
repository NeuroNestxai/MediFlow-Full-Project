package com.google.android.gms.tasks

abstract class Task<T>
class CancellationToken
class CancellationTokenSource {
    val token: CancellationToken get() = TODO()
    fun cancel() {}
}
