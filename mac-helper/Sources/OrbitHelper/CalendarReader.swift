import EventKit
import Foundation

/// Reads the calendar event that matches a call, for the title Orbit uses to find the client and the attendee names.
final class CalendarReader {
    private let store = EKEventStore()

    var authorized: Bool { EKEventStore.authorizationStatus(for: .event) == .fullAccess }

    func requestAccess() async -> Bool {
        (try? await store.requestFullAccessToEvents()) ?? false
    }

    /// The timed event closest to `date` that is running, about to start or just ended. All day events are ignored.
    func event(at date: Date) -> (title: String, attendees: [String])? {
        guard authorized else { return nil }
        let predicate = store.predicateForEvents(withStart: date.addingTimeInterval(-4 * 3600), end: date.addingTimeInterval(20 * 60), calendars: nil)
        let candidates = store.events(matching: predicate).filter {
            !$0.isAllDay && $0.startDate <= date.addingTimeInterval(15 * 60) && $0.endDate >= date.addingTimeInterval(-10 * 60)
        }
        guard let event = candidates.min(by: { abs($0.startDate.timeIntervalSince(date)) < abs($1.startDate.timeIntervalSince(date)) }) else { return nil }
        let attendees: [String] = (event.attendees ?? []).compactMap { person in
            if let name = person.name, !name.isEmpty, !name.contains("@") { return name }
            let url = person.url.absoluteString
            return url.hasPrefix("mailto:") ? String(url.dropFirst(7)) : nil
        }
        return (event.title ?? "", attendees)
    }
}
