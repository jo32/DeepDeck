import AppKit
import Darwin
import Foundation

private struct HelperOptions {
    let parentPid: pid_t
    let appPath: String
    let statePath: String
    let sourceVersion: String
    let targetVersion: String
    let displayName: String
    let locale: String
    let preview: Bool
    let skipSecurityVerification: Bool

    static func parse(_ arguments: [String]) throws -> HelperOptions {
        var values: [String: String] = [:]
        var flags = Set<String>()
        var index = 0
        while index < arguments.count {
            let key = arguments[index]
            if key == "--preview" || key == "--skip-security-verification" {
                flags.insert(key)
                index += 1
                continue
            }
            guard key.hasPrefix("--"), index + 1 < arguments.count else {
                throw NSError(domain: "DeepDeckUpdateHelper", code: 2, userInfo: [
                    NSLocalizedDescriptionKey: "Invalid update-helper arguments."
                ])
            }
            values[key] = arguments[index + 1]
            index += 2
        }

        func required(_ key: String) throws -> String {
            guard let value = values[key], !value.isEmpty else {
                throw NSError(domain: "DeepDeckUpdateHelper", code: 2, userInfo: [
                    NSLocalizedDescriptionKey: "Missing argument \(key)."
                ])
            }
            return value
        }

        let parent = try required("--parent-pid")
        guard let parentPid = pid_t(parent), parentPid > 0 else {
            throw NSError(domain: "DeepDeckUpdateHelper", code: 2, userInfo: [
                NSLocalizedDescriptionKey: "Invalid parent process identifier."
            ])
        }
        return HelperOptions(
            parentPid: parentPid,
            appPath: try required("--app-path"),
            statePath: try required("--state-path"),
            sourceVersion: try required("--source-version"),
            targetVersion: try required("--target-version"),
            displayName: try required("--display-name"),
            locale: try required("--locale"),
            preview: flags.contains("--preview"),
            skipSecurityVerification: flags.contains("--skip-security-verification")
        )
    }
}

private struct Copy {
    let windowTitle: String
    let title: String
    let preparing: String
    let installing: String
    let verifying: String
    let launching: String
    let footnote: String
    let versionTransition: String
    let failedTitle: String
    let failed: String
    let openApp: String

    init(options: HelperOptions) {
        if options.locale.lowercased().hasPrefix("zh") {
            windowTitle = "\(options.displayName) 更新"
            title = "正在安装更新"
            preparing = "正在准备 \(options.displayName) v\(options.targetVersion)…"
            installing = "正在替换应用，请不要关闭此窗口…"
            verifying = "正在验证新版本的完整性与签名…"
            launching = "更新完成，正在重新打开 \(options.displayName)…"
            footnote = "完成后，\(options.displayName) 将自动重新打开"
            versionTransition = "v\(options.sourceVersion)  →  v\(options.targetVersion)"
            failedTitle = "未能完成更新"
            failed = "更新没有完成。你可以重新打开原版本后再试一次。"
            openApp = "打开 \(options.displayName)"
        } else {
            windowTitle = "\(options.displayName) Update"
            title = "Installing update"
            preparing = "Preparing \(options.displayName) v\(options.targetVersion)…"
            installing = "Replacing the application. Keep this window open…"
            verifying = "Verifying the new version and its signature…"
            launching = "Update complete. Reopening \(options.displayName)…"
            footnote = "\(options.displayName) will reopen automatically when ready"
            versionTransition = "v\(options.sourceVersion)  →  v\(options.targetVersion)"
            failedTitle = "Update couldn’t be completed"
            failed = "The update did not finish. Reopen the previous version and try again."
            openApp = "Open \(options.displayName)"
        }
    }
}

private func processIsAlive(_ pid: pid_t) -> Bool {
    if kill(pid, 0) == 0 { return true }
    return errno == EPERM
}

private func inode(at path: String) -> UInt64? {
    var information = stat()
    guard lstat(path, &information) == 0 else { return nil }
    return UInt64(information.st_ino)
}

private func bundleVersion(at appPath: String) -> String? {
    let infoPath = (appPath as NSString).appendingPathComponent("Contents/Info.plist")
    guard let dictionary = NSDictionary(contentsOfFile: infoPath) else { return nil }
    return dictionary["CFBundleShortVersionString"] as? String
}

private func shipItIsRunning() -> Bool {
    if !NSRunningApplication.runningApplications(
        withBundleIdentifier: "com.jo32.deepdeck.ShipIt"
    ).isEmpty { return true }
    return NSWorkspace.shared.runningApplications.contains { application in
        application.bundleIdentifier == "com.jo32.deepdeck.ShipIt"
    }
}

private func commandResult(_ executable: String, _ arguments: [String]) -> (Bool, String) {
    let process = Process()
    let output = Pipe()
    process.executableURL = URL(fileURLWithPath: executable)
    process.arguments = arguments
    process.standardOutput = output
    process.standardError = output
    do {
        try process.run()
        process.waitUntilExit()
        let data = output.fileHandleForReading.readDataToEndOfFile()
        let message = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return (process.terminationStatus == 0, message)
    } catch {
        return (false, error.localizedDescription)
    }
}

private final class UpdateController: NSObject, NSWindowDelegate {
    private let options: HelperOptions
    private let copy: Copy
    private let initialInode: UInt64?
    private let startedAt = Date()
    private var replacementSeenAt: Date?
    private var validationStarted = false
    private var failed = false
    private var timer: Timer?

    private let window: NSWindow
    private let appIcon = NSImageView()
    private let progress = NSProgressIndicator()
    private let titleLabel = NSTextField(labelWithString: "")
    private let detailLabel = NSTextField(wrappingLabelWithString: "")
    private let versionLabel = NSTextField(labelWithString: "")
    private let footnoteLabel = NSTextField(labelWithString: "")
    private let recoveryButton = NSButton()

    init(options: HelperOptions) {
        self.options = options
        self.copy = Copy(options: options)
        self.initialInode = inode(at: options.appPath)
        self.window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 440, height: 174),
            styleMask: [.titled, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        super.init()
        configureWindow()
    }

    func start() {
        if !options.preview {
            updateTransaction(phase: "installing", message: nil)
        }
        NSApp.setActivationPolicy(.accessory)
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        progress.startAnimation(nil)
        show(copy.preparing)
        if options.preview { return }
        timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            self?.poll()
        }
    }

    private func configureWindow() {
        window.title = copy.windowTitle
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.isMovableByWindowBackground = true
        window.backgroundColor = .windowBackgroundColor
        window.standardWindowButton(.closeButton)?.isHidden = true
        window.standardWindowButton(.miniaturizeButton)?.isHidden = true
        window.standardWindowButton(.zoomButton)?.isHidden = true
        window.delegate = self

        guard let content = window.contentView else { return }

        appIcon.image = NSWorkspace.shared.icon(forFile: options.appPath)
        appIcon.imageScaling = .scaleProportionallyUpOrDown
        appIcon.translatesAutoresizingMaskIntoConstraints = false

        progress.style = .bar
        progress.controlSize = .small
        progress.isIndeterminate = true
        progress.translatesAutoresizingMaskIntoConstraints = false

        titleLabel.stringValue = copy.title
        titleLabel.font = .systemFont(ofSize: 18, weight: .semibold)
        titleLabel.textColor = .labelColor
        titleLabel.translatesAutoresizingMaskIntoConstraints = false

        detailLabel.textColor = .secondaryLabelColor
        detailLabel.font = .systemFont(ofSize: 13.5)
        detailLabel.maximumNumberOfLines = 3
        detailLabel.setContentHuggingPriority(.required, for: .vertical)
        detailLabel.setContentCompressionResistancePriority(.required, for: .vertical)
        detailLabel.translatesAutoresizingMaskIntoConstraints = false

        versionLabel.stringValue = copy.versionTransition
        versionLabel.font = .monospacedDigitSystemFont(ofSize: 11.5, weight: .medium)
        versionLabel.textColor = .secondaryLabelColor.withAlphaComponent(0.72)
        versionLabel.translatesAutoresizingMaskIntoConstraints = false

        footnoteLabel.stringValue = copy.footnote
        footnoteLabel.font = .systemFont(ofSize: 11.5)
        footnoteLabel.textColor = .secondaryLabelColor.withAlphaComponent(0.72)
        footnoteLabel.alignment = .right
        footnoteLabel.translatesAutoresizingMaskIntoConstraints = false

        recoveryButton.title = copy.openApp
        recoveryButton.bezelStyle = .rounded
        recoveryButton.controlSize = .regular
        recoveryButton.target = self
        recoveryButton.action = #selector(openExistingApp)
        recoveryButton.isHidden = true
        recoveryButton.translatesAutoresizingMaskIntoConstraints = false

        for view in [appIcon, titleLabel, detailLabel, progress, versionLabel, footnoteLabel, recoveryButton] {
            content.addSubview(view)
        }
        NSLayoutConstraint.activate([
            appIcon.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 28),
            appIcon.topAnchor.constraint(equalTo: titleLabel.topAnchor, constant: -4),
            appIcon.widthAnchor.constraint(equalToConstant: 52),
            appIcon.heightAnchor.constraint(equalToConstant: 52),
            titleLabel.leadingAnchor.constraint(equalTo: appIcon.trailingAnchor, constant: 18),
            titleLabel.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -28),
            titleLabel.topAnchor.constraint(equalTo: content.topAnchor, constant: 40),
            detailLabel.leadingAnchor.constraint(equalTo: titleLabel.leadingAnchor),
            detailLabel.trailingAnchor.constraint(equalTo: titleLabel.trailingAnchor),
            detailLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 5),
            progress.leadingAnchor.constraint(equalTo: titleLabel.leadingAnchor),
            progress.trailingAnchor.constraint(equalTo: titleLabel.trailingAnchor),
            progress.topAnchor.constraint(equalTo: detailLabel.bottomAnchor, constant: 13),
            progress.heightAnchor.constraint(equalToConstant: 4),
            versionLabel.leadingAnchor.constraint(equalTo: titleLabel.leadingAnchor),
            versionLabel.topAnchor.constraint(equalTo: progress.bottomAnchor, constant: 20),
            versionLabel.bottomAnchor.constraint(lessThanOrEqualTo: content.bottomAnchor, constant: -17),
            footnoteLabel.leadingAnchor.constraint(greaterThanOrEqualTo: versionLabel.trailingAnchor, constant: 16),
            footnoteLabel.trailingAnchor.constraint(equalTo: titleLabel.trailingAnchor),
            footnoteLabel.firstBaselineAnchor.constraint(equalTo: versionLabel.firstBaselineAnchor),
            recoveryButton.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -28),
            recoveryButton.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -18),
        ])
    }

    private func poll() {
        guard !failed, !validationStarted else { return }
        if Date().timeIntervalSince(startedAt) > 300 {
            fail("Timed out waiting for the application bundle to be replaced.")
            return
        }
        if processIsAlive(options.parentPid) {
            show(copy.preparing)
            return
        }

        show(copy.installing)
        let currentInode = inode(at: options.appPath)
        let replaced = initialInode != nil && currentInode != nil && currentInode != initialInode
        let targetIsInstalled = bundleVersion(at: options.appPath) == options.targetVersion
        if replaced && targetIsInstalled {
            replacementSeenAt = replacementSeenAt ?? Date()
        } else {
            replacementSeenAt = nil
        }
        guard
            let replacementSeenAt,
            Date().timeIntervalSince(replacementSeenAt) >= 4,
            !shipItIsRunning()
        else { return }
        validateAndLaunch()
    }

    private func validateAndLaunch() {
        validationStarted = true
        show(copy.verifying)
        updateTransaction(phase: "verifying", message: nil)
        DispatchQueue.global(qos: .userInitiated).async { [options] in
            var errorMessage: String?
            if !options.skipSecurityVerification {
                let signature = commandResult("/usr/bin/codesign", [
                    "--verify", "--deep", "--strict", "--verbose=2", options.appPath,
                ])
                if !signature.0 {
                    errorMessage = signature.1.isEmpty ? "Code signature verification failed." : signature.1
                } else {
                    let assessment = commandResult("/usr/sbin/spctl", [
                        "--assess", "--type", "execute", "--verbose=2", options.appPath,
                    ])
                    if !assessment.0 {
                        errorMessage = assessment.1.isEmpty ? "Gatekeeper assessment failed." : assessment.1
                    }
                }
            }
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                if let errorMessage {
                    self.fail(errorMessage)
                } else {
                    self.launchUpdatedApp()
                }
            }
        }
    }

    private func launchUpdatedApp() {
        show(copy.launching)
        updateTransaction(phase: "launching", message: nil)
        let configuration = NSWorkspace.OpenConfiguration()
        configuration.activates = true
        NSWorkspace.shared.openApplication(
            at: URL(fileURLWithPath: options.appPath),
            configuration: configuration
        ) { [weak self] _, error in
            DispatchQueue.main.async {
                guard let self else { return }
                if let error {
                    self.fail(error.localizedDescription)
                } else {
                    NSApp.terminate(nil)
                }
            }
        }
    }

    private func fail(_ diagnostic: String) {
        failed = true
        timer?.invalidate()
        window.setContentSize(NSSize(width: 440, height: 216))
        progress.stopAnimation(nil)
        progress.isHidden = true
        titleLabel.stringValue = copy.failedTitle
        detailLabel.stringValue = "\(copy.failed)\n\(diagnostic)"
        detailLabel.font = .systemFont(ofSize: 12.5)
        versionLabel.isHidden = true
        footnoteLabel.isHidden = true
        recoveryButton.isHidden = false
        window.standardWindowButton(.closeButton)?.isHidden = false
        updateTransaction(phase: "failed", message: diagnostic)
        NSApp.requestUserAttention(.criticalRequest)
    }

    private func show(_ message: String) {
        detailLabel.stringValue = message
    }

    private func updateTransaction(phase: String, message: String?) {
        let url = URL(fileURLWithPath: options.statePath)
        var transaction: [String: Any] = [:]
        if
            let data = try? Data(contentsOf: url),
            let existing = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        {
            transaction = existing
        }
        transaction["schemaVersion"] = 1
        transaction["phase"] = phase
        transaction["sourceVersion"] = options.sourceVersion
        transaction["targetVersion"] = options.targetVersion
        transaction["appPath"] = options.appPath
        transaction["helperPid"] = Int(ProcessInfo.processInfo.processIdentifier)
        transaction["startedAt"] = transaction["startedAt"] ?? Int64(Date().timeIntervalSince1970 * 1_000)
        transaction["updatedAt"] = Int64(Date().timeIntervalSince1970 * 1_000)
        if let message {
            transaction["message"] = message
        } else {
            transaction.removeValue(forKey: "message")
        }
        guard let data = try? JSONSerialization.data(withJSONObject: transaction, options: [.prettyPrinted, .sortedKeys]) else { return }
        try? data.write(to: url, options: .atomic)
    }

    @objc private func openExistingApp() {
        let configuration = NSWorkspace.OpenConfiguration()
        configuration.activates = true
        NSWorkspace.shared.openApplication(
            at: URL(fileURLWithPath: options.appPath),
            configuration: configuration
        ) { [weak self] _, error in
            DispatchQueue.main.async {
                if let error {
                    self?.detailLabel.stringValue = "\(self?.copy.failed ?? "")\n\(error.localizedDescription)"
                } else {
                    NSApp.terminate(nil)
                }
            }
        }
    }

    func windowWillClose(_ notification: Notification) {
        if failed { NSApp.terminate(nil) }
    }
}

if CommandLine.arguments.dropFirst().contains("--self-check") {
    print("deepdeck-update-helper ok")
    exit(0)
}
if CommandLine.arguments.dropFirst().contains("--bundle-identity") {
    print(NSRunningApplication.current.bundleIdentifier ?? "none")
    exit(0)
}

do {
    let options = try HelperOptions.parse(Array(CommandLine.arguments.dropFirst()))
    let application = NSApplication.shared
    let controller = UpdateController(options: options)
    controller.start()
    application.run()
} catch {
    fputs("deepdeck-update-helper: \(error.localizedDescription)\n", stderr)
    exit(2)
}
