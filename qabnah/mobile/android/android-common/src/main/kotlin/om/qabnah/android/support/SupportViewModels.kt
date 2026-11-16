package om.qabnah.android.support

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import om.qabnah.android.state.Loadable
import om.qabnah.android.state.launchLoad
import om.qabnah.core.model.NewTicket
import om.qabnah.core.model.NotificationPage
import om.qabnah.core.model.Ticket
import om.qabnah.core.model.TicketCategory

class TicketsViewModel(private val repo: SupportRepository) : ViewModel() {
    private val _state = MutableStateFlow(Loadable<List<Ticket>>())
    val state: StateFlow<Loadable<List<Ticket>>> = _state.asStateFlow()

    init { load() }

    fun load(refresh: Boolean = false) {
        _state.launchLoad(viewModelScope, refresh) { repo.tickets() }
    }
}

data class TicketDetailUi(val reply: String = "", val sending: Boolean = false, val sendError: Throwable? = null)

class TicketDetailViewModel(private val repo: SupportRepository, private val id: String) : ViewModel() {
    private val _state = MutableStateFlow(Loadable<Ticket>())
    val state: StateFlow<Loadable<Ticket>> = _state.asStateFlow()
    private val _ui = MutableStateFlow(TicketDetailUi())
    val ui: StateFlow<TicketDetailUi> = _ui.asStateFlow()

    init { load() }

    fun load(refresh: Boolean = false) {
        _state.launchLoad(viewModelScope, refresh) { repo.ticket(id) }
    }

    fun onReplyChange(text: String) = _ui.update { it.copy(reply = text, sendError = null) }

    fun send() {
        val body = _ui.value.reply.trim()
        if (body.isEmpty() || _ui.value.sending) return
        viewModelScope.launch {
            _ui.update { it.copy(sending = true, sendError = null) }
            try {
                repo.reply(id, body)
                _ui.value = TicketDetailUi()
                load(refresh = true)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _ui.update { it.copy(sending = false, sendError = e) }
            }
        }
    }
}

data class NewTicketUi(
    val subject: String = "",
    val category: TicketCategory = TicketCategory.OTHER,
    val message: String = "",
    val submitting: Boolean = false,
    val error: Throwable? = null,
    val missingFields: Boolean = false,
    val createdId: String? = null,
)

class NewTicketViewModel(private val repo: SupportRepository, private val orderId: String?) : ViewModel() {
    private val _ui = MutableStateFlow(NewTicketUi(category = if (orderId != null) TicketCategory.ORDER_ISSUE else TicketCategory.OTHER))
    val ui: StateFlow<NewTicketUi> = _ui.asStateFlow()
    val hasOrder: Boolean get() = orderId != null

    fun onSubject(v: String) = _ui.update { it.copy(subject = v.take(120), missingFields = false) }
    fun onMessage(v: String) = _ui.update { it.copy(message = v.take(2000), missingFields = false) }
    fun onCategory(v: TicketCategory) = _ui.update { it.copy(category = v) }

    fun submit() {
        val s = _ui.value
        if (s.subject.isBlank() || s.message.isBlank()) {
            _ui.update { it.copy(missingFields = true) }
            return
        }
        viewModelScope.launch {
            _ui.update { it.copy(submitting = true, error = null) }
            try {
                val t = repo.create(NewTicket(s.subject.trim(), s.category, s.message.trim(), orderId))
                _ui.update { it.copy(submitting = false, createdId = t.id) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _ui.update { it.copy(submitting = false, error = e) }
            }
        }
    }
}

class NotificationsViewModel(private val repo: SupportRepository) : ViewModel() {
    private val _state = MutableStateFlow(Loadable<NotificationPage>())
    val state: StateFlow<Loadable<NotificationPage>> = _state.asStateFlow()

    init { load() }

    fun load(refresh: Boolean = false) {
        _state.launchLoad(viewModelScope, refresh) { repo.notifications() }
    }

    /** Optimistic: marks read locally, then tells the server. */
    fun markRead(id: String) {
        val page = _state.value.data ?: return
        val n = page.items.firstOrNull { it.id == id } ?: return
        if (n.readAt != null) return
        _state.update {
            it.copy(
                data = page.copy(
                    items = page.items.map { item -> if (item.id == id) item.copy(readAt = "now") else item },
                    unread = (page.unread - 1).coerceAtLeast(0),
                ),
            )
        }
        viewModelScope.launch { runCatching { repo.markRead(id) } }
    }
}
