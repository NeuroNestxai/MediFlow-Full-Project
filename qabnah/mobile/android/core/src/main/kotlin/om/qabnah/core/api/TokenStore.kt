package om.qabnah.core.api

/** Persisted session. [accessExpiresAtEpochMs] lets clients refresh shortly before expiry. */
data class StoredTokens(
    val accessToken: String,
    val refreshToken: String,
    val accessExpiresAtEpochMs: Long,
)

/**
 * Where the session lives. Android apps implement this with EncryptedSharedPreferences;
 * tests use [InMemoryTokenStore]. Implementations must be thread-safe.
 */
interface TokenStore {
    fun read(): StoredTokens?
    fun write(tokens: StoredTokens?)
}

class InMemoryTokenStore(initial: StoredTokens? = null) : TokenStore {
    @Volatile private var tokens: StoredTokens? = initial
    override fun read(): StoredTokens? = tokens
    override fun write(tokens: StoredTokens?) {
        this.tokens = tokens
    }
}
