// Records one window to a video file through ScreenCaptureKit, whether or not other
// windows cover it.
//
//   record-window <pid> <top> <width> <height> <out.mov>
//
// Captures the webview of the largest on-screen window `pid` owns: the region `top` points
// below the window's top edge (under the title bar), `width` by `height` points, less a
// strip at the bottom where the window's corners are rounded. Records at the display's
// backing scale. Prints `recording` once frames flow, and stops and finishes the file
// when stdin closes.

import AppKit
import AVFoundation
import Foundation
import ScreenCaptureKit

final class Finished: NSObject, SCRecordingOutputDelegate, SCStreamDelegate {
  var stopped = false
  var done = false
  var error: Error?

  func stream(_ stream: SCStream, didStopWithError error: Error) {
    FileHandle.standardError.write("[record-window] stream stopped: \(error)\n".data(using: .utf8)!)
    stopped = true
  }

  func recordingOutputDidFinishRecording(_ recordingOutput: SCRecordingOutput) {
    done = true
  }

  func recordingOutput(_ recordingOutput: SCRecordingOutput, didFailWithError error: Error) {
    self.error = error
    done = true
  }
}

func fail(_ message: String) -> Never {
  FileHandle.standardError.write("[record-window] \(message)\n".data(using: .utf8)!)
  exit(1)
}

let args = CommandLine.arguments
guard args.count == 6, let pid = pid_t(args[1]), let top = Double(args[2]),
  let width = Double(args[3]), let height = Double(args[4])
else {
  fail("usage: record-window <pid> <top> <width> <height> <out.mov>")
}
// ScreenCaptureKit needs a window server connection, which a bare CLI lacks.
_ = NSApplication.shared
let out = URL(fileURLWithPath: args[5])
try? FileManager.default.removeItem(at: out)

let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true)
guard
  let window = content.windows
    .filter({ $0.owningApplication?.processID == pid && $0.windowLayer == 0 })
    .max(by: { $0.frame.width * $0.frame.height < $1.frame.width * $1.frame.height })
else { fail("no on-screen window for pid \(pid)") }

let filter = SCContentFilter(desktopIndependentWindow: window)
let scale = Double(filter.pointPixelScale)
let corner = 16.0
let source = CGRect(x: 0, y: top, width: width, height: height - corner)

let config = SCStreamConfiguration()
config.sourceRect = source
config.width = Int(source.width * scale) / 2 * 2
config.height = Int(source.height * scale) / 2 * 2
config.minimumFrameInterval = CMTime(value: 1, timescale: 30)
config.showsCursor = false
config.capturesAudio = false

let recordingConfig = SCRecordingOutputConfiguration()
recordingConfig.outputURL = out
recordingConfig.outputFileType = .mov
recordingConfig.videoCodecType = .h264

let finished = Finished()
let recording = SCRecordingOutput(configuration: recordingConfig, delegate: finished)
let stream = SCStream(filter: filter, configuration: config, delegate: finished)
try stream.addRecordingOutput(recording)
try await withCheckedThrowingContinuation { (resume: CheckedContinuation<Void, Error>) in
  stream.startCapture { error in error.map { resume.resume(throwing: $0) } ?? resume.resume() }
}
print("recording \(config.width)x\(config.height)")
fflush(stdout)

_ = FileHandle.standardInput.readDataToEndOfFile()
if !finished.stopped {
  try await withCheckedThrowingContinuation { (resume: CheckedContinuation<Void, Error>) in
    stream.stopCapture { error in error.map { resume.resume(throwing: $0) } ?? resume.resume() }
  }
}
while !finished.done { try await Task.sleep(for: .milliseconds(50)) }
if let error = finished.error { fail("recording failed: \(error)") }
