import SwiftUI
import QabnahKit

@MainActor
final class ZonesViewModel: ObservableObject {
    @Published private(set) var state: Loadable<[Zone]> = .idle
    @Published var selected: Set<String> = []
    @Published private(set) var isSaving = false
    @Published var error: Error?
    private let api: APIClient

    init(api: APIClient) { self.api = api }

    func load(current: [String]) async {
        selected = Set(current)
        if state.value == nil { state = .loading }
        do {
            // `GET /zones` already returns only active zones.
            state = .loaded(try await api.send(Endpoints.zones()).items)
        } catch {
            if (error as? APIError)?.isCancelled == true { return }
            state = .failed(error)
        }
    }

    func save() async -> CaptainProfile? {
        isSaving = true
        defer { isSaving = false }
        do {
            let p = try await api.send(Endpoints.setCaptainZones(Array(selected).sorted()))
            error = nil
            return p
        } catch {
            self.error = error
            return nil
        }
    }
}

/// `GET /zones` → `PUT /captain/zones`.
struct ZonesView: View {
    @EnvironmentObject var lang: LanguageSettings
    @EnvironmentObject var store: CaptainStore
    @Environment(\.dismiss) var dismiss
    @StateObject private var vm: ZonesViewModel

    init(api: APIClient) { _vm = StateObject(wrappedValue: ZonesViewModel(api: api)) }

    var body: some View {
        LoadableView(state: vm.state, retry: { Task { await vm.load(current: store.profile?.zoneIds ?? []) } }) { zones in
            List {
                Section {
                    Text(lang.t("zones.intro")).font(.subheadline).foregroundColor(.secondary)
                }
                Section {
                    ForEach(zones) { z in
                        Button {
                            if vm.selected.contains(z.id) { vm.selected.remove(z.id) } else { vm.selected.insert(z.id) }
                        } label: {
                            HStack {
                                Text(lang.name(z))
                                Spacer()
                                Image(systemName: vm.selected.contains(z.id) ? "checkmark.circle.fill" : "circle")
                                    .foregroundColor(Brand.primary)
                                    .accessibilityHidden(true)
                            }
                        }
                        .foregroundColor(.primary)
                        .accessibilityAddTraits(vm.selected.contains(z.id) ? .isSelected : [])
                    }
                }
                if vm.error != nil { Section { InlineError(error: vm.error) } }
            }
        }
        .navigationTitle(lang.t("onboarding.zones"))
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                if vm.isSaving {
                    ProgressView()
                } else {
                    Button(lang.t("common.save")) {
                        Task {
                            if let p = await vm.save() {
                                store.setProfile(p)
                                dismiss()
                            }
                        }
                    }
                    .disabled(vm.selected.isEmpty)
                }
            }
        }
        .task { await vm.load(current: store.profile?.zoneIds ?? []) }
    }
}

/// Weekly availability editor (local Muscat time) → `PUT /captain/availability`.
struct AvailabilityView: View {
    @EnvironmentObject var lang: LanguageSettings
    @EnvironmentObject var session: SessionStore
    @EnvironmentObject var store: CaptainStore
    @Environment(\.dismiss) var dismiss
    @State private var slots: [AvailabilitySlot] = []
    @State private var loaded = false
    @State private var isSaving = false
    @State private var error: Error? = nil
    @State private var adding: Int? = nil

    private static let weekdays = Array(0...6) // 0 = Sunday

    var body: some View {
        List {
            Section {
                Text(lang.t("availability.intro")).font(.subheadline).foregroundColor(.secondary)
            }
            ForEach(Self.weekdays, id: \.self) { day in
                Section(lang.t("weekday.\(day)")) {
                    let daySlots = slots.filter { $0.weekday == day }.sorted { $0.start < $1.start }
                    if daySlots.isEmpty {
                        Text(lang.t("availability.off")).foregroundColor(.secondary)
                    }
                    ForEach(daySlots) { slot in
                        HStack {
                            Text(lang.digits("\(slot.start) – \(slot.end)")).font(.body.monospacedDigit())
                            Spacer()
                            Button(role: .destructive) {
                                slots.removeAll { $0 == slot }
                            } label: { Image(systemName: "minus.circle.fill") }
                            .buttonStyle(.borderless)
                            .accessibilityLabel(lang.t("availability.remove"))
                        }
                    }
                    Button { adding = day } label: { Label(lang.t("availability.add"), systemImage: "plus") }
                }
            }
            if error != nil { Section { InlineError(error: error) } }
        }
        .navigationTitle(lang.t("onboarding.availability"))
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                if isSaving {
                    ProgressView()
                } else {
                    Button(lang.t("common.save")) { Task { await save() } }
                }
            }
        }
        .sheet(item: Binding(get: { adding.map { WeekdayID(id: $0) } }, set: { adding = $0?.id })) { w in
            SlotEditor(weekday: w.id) { slots.append($0) }
        }
        .onAppear {
            if !loaded {
                slots = store.profile?.availability ?? []
                loaded = true
            }
        }
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }
        do {
            let p = try await session.api.send(Endpoints.setCaptainAvailability(slots.filter(\.isValid)))
            store.setProfile(p)
            error = nil
            dismiss()
        } catch {
            self.error = error
        }
    }
}

private struct WeekdayID: Identifiable {
    let id: Int
}

private struct SlotEditor: View {
    @EnvironmentObject var lang: LanguageSettings
    @Environment(\.dismiss) var dismiss
    let weekday: Int
    let onAdd: (AvailabilitySlot) -> Void
    @State private var start = SlotEditor.time(8, 0)
    @State private var end = SlotEditor.time(14, 0)

    private static func time(_ h: Int, _ m: Int) -> Date {
        var c = DateComponents()
        c.hour = h
        c.minute = m
        return MuscatCalendar.calendar.date(from: c) ?? Date()
    }

    private func hhmm(_ d: Date) -> String {
        let c = MuscatCalendar.calendar.dateComponents([.hour, .minute], from: d)
        return AvailabilitySlot.hhmm((c.hour ?? 0) * 60 + (c.minute ?? 0))
    }

    private var slot: AvailabilitySlot { AvailabilitySlot(weekday: weekday, start: hhmm(start), end: hhmm(end)) }

    var body: some View {
        NavigationStack {
            Form {
                DatePicker(lang.t("availability.start"), selection: $start, displayedComponents: .hourAndMinute)
                DatePicker(lang.t("availability.end"), selection: $end, displayedComponents: .hourAndMinute)
                if !slot.isValid {
                    Text(lang.t("availability.invalid")).font(.footnote).foregroundColor(Brand.danger)
                }
            }
            .environment(\.timeZone, MuscatCalendar.timeZone)
            .navigationTitle(lang.t("weekday.\(weekday)"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(lang.t("common.cancel")) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(lang.t("availability.add")) {
                        onAdd(slot)
                        dismiss()
                    }
                    .disabled(!slot.isValid)
                }
            }
        }
        .presentationDetents([.medium])
    }
}
