import XCTest
@testable import OrbitHelperCore

final class CoreTests: XCTestCase {
    func testMergePutsBothTracksOnOneTimelineAndJoinsShortRuns() {
        let me = [TimedSegment(start: 0, end: 2, speaker: "me", text: "Good morning."), TimedSegment(start: 2.5, end: 4, speaker: "me", text: "Shall we start?")]
        let others = [TimedSegment(start: 1, end: 3, speaker: "other", text: "Morning Saaqib.")]
        let merged = mergeTracks(me: me, others: others, othersOffset: 3)
        XCTAssertEqual(merged.map(\.speaker), ["me", "other"])
        XCTAssertEqual(merged[0].text, "Good morning. Shall we start?")
        XCTAssertEqual(merged[1].start, 4)
    }

    func testCleanDropsNoiseAndRepeats() {
        let raw = [
            TimedSegment(start: 0, end: 1, speaker: "other", text: "[BLANK_AUDIO]"),
            TimedSegment(start: 1, end: 2, speaker: "other", text: "<|startoftranscript|> Hello"),
            TimedSegment(start: 2, end: 3, speaker: "other", text: "Hello"),
            TimedSegment(start: 3, end: 4, speaker: "other", text: "Thank you."),
        ]
        XCTAssertEqual(cleanSegments(raw).map(\.text), ["Hello"])
    }

    func testBodyMatchesOrbitsContract() throws {
        let start = Date(timeIntervalSince1970: 1_790_000_000)
        let body = IngestBody(startedAt: start, endedAt: start.addingTimeInterval(3600), calendarTitle: "ADFH x Fero BRD Session 3", attendees: ["Nadia Haddad", ""], segments: [TimedSegment(start: -1, end: 2, speaker: "me", text: "Hi")])
        let json = try JSONSerialization.jsonObject(with: body.encoded()) as! [String: Any]
        XCTAssertEqual(json["source"] as? String, "mac_helper")
        XCTAssertEqual((json["attendees"] as? [String])?.count, 1)
        XCTAssertTrue((json["startedAt"] as! String).range(of: #"[+-]\d{2}:\d{2}$|Z$"#, options: .regularExpression) != nil)
        let seg = (json["segments"] as! [[String: Any]])[0]
        XCTAssertEqual(seg["start"] as? Double, 0)
    }

    func testTeamsWindowRules() {
        XCTAssertFalse(CallRules.isTeamsCallWindow("Chat | Microsoft Teams"))
        XCTAssertFalse(CallRules.isTeamsCallWindow("Calendar | Fero | Microsoft Teams"))
        XCTAssertTrue(CallRules.isTeamsCallWindow("ADFH x Fero BRD Session 3 | Microsoft Teams"))
        XCTAssertEqual(CallRules.callTitle(fromWindow: "ADFH x Fero BRD Session 3 | Microsoft Teams"), "ADFH x Fero BRD Session 3")
        XCTAssertTrue(CallRules.isMeetWindow("Meet - abc-defg-hij - Google Chrome"))
        XCTAssertTrue(CallRules.isZoomCallWindow("Zoom Meeting"))
    }

    func testMicrophoneOwnersMapToApps() {
        XCTAssertEqual(CallRules.app(forBundle: "com.microsoft.teams2"), .teams)
        XCTAssertEqual(CallRules.app(forBundle: "com.microsoft.teams2.helper"), .teams)
        XCTAssertEqual(CallRules.app(forBundle: "us.zoom.xos"), .zoom)
        XCTAssertEqual(CallRules.app(forBundle: "com.google.Chrome.helper"), .meet)
        XCTAssertEqual(CallRules.app(forBundle: "com.apple.WebKit.GPU"), .meet)
        XCTAssertNil(CallRules.app(forBundle: "com.apple.VoiceMemos"))
    }

    func testGracePeriodKeepsOneRecordingAcrossAQuickRejoin() {
        var t = CallTracker(grace: 90)
        let t0 = Date(timeIntervalSince1970: 0)
        XCTAssertEqual(t.observe(.teams, at: t0), .started(.teams))
        XCTAssertEqual(t.observe(nil, at: t0.addingTimeInterval(60)), .none)
        XCTAssertEqual(t.observe(.teams, at: t0.addingTimeInterval(80)), .none)
        XCTAssertEqual(t.observe(nil, at: t0.addingTimeInterval(120)), .none)
        XCTAssertEqual(t.observe(nil, at: t0.addingTimeInterval(170)), .ended(started: t0, ended: t0.addingTimeInterval(80)))
    }

    func testRetryDelaysGrow() {
        XCTAssertEqual([1, 2, 3, 4, 9].map(retryDelay(attempt:)), [30, 120, 600, 1800, 3600])
    }
}
