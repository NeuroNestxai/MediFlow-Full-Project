package om.qabnah.android.support

import om.qabnah.core.api.QabnahApi
import om.qabnah.core.model.NewTicket
import om.qabnah.core.model.NotificationPage
import om.qabnah.core.model.Ticket

/** Support tickets and in-app notifications (`/support/tickets*`, `/me/notifications*`). */
class SupportRepository(private val api: QabnahApi) {
    suspend fun tickets(): List<Ticket> = api.tickets().sortedByDescending { it.updatedAt.ifBlank { it.createdAt } }
    suspend fun ticket(id: String): Ticket = api.ticket(id)
    suspend fun create(ticket: NewTicket): Ticket = api.createTicket(ticket)
    suspend fun reply(id: String, body: String) = api.replyTicket(id, body)
    suspend fun notifications(limit: Int = 50): NotificationPage = api.notifications(limit = limit)
    suspend fun markRead(id: String) = api.markNotificationRead(id)
}
