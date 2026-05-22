import CoreHaptics
import ExpoModulesCore

public class QulteHapticsModule: Module {
  private var engine: CHHapticEngine?

  public func definition() -> ModuleDefinition {
    Name("QulteHaptics")

    AsyncFunction("playMovieSentAsync") {
      try self.playMovieSent()
    }
    .runOnQueue(.main)
  }

  private func makeEngine() throws -> CHHapticEngine {
    if let engine {
      return engine
    }

    let createdEngine = try CHHapticEngine()
    createdEngine.stoppedHandler = { [weak self] _ in
      self?.engine = nil
    }
    createdEngine.resetHandler = { [weak self] in
      try? self?.engine?.start()
    }
    engine = createdEngine
    return createdEngine
  }

  private func playMovieSent() throws {
    guard CHHapticEngine.capabilitiesForHardware().supportsHaptics else {
      return
    }

    let engine = try makeEngine()
    try engine.start()

    let events = [
      CHHapticEvent(
        eventType: .hapticContinuous,
        parameters: [
          CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.12),
          CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.08)
        ],
        relativeTime: 0,
        duration: 0.24
      ),
      CHHapticEvent(
        eventType: .hapticTransient,
        parameters: [
          CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.18),
          CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.18)
        ],
        relativeTime: 0.09
      ),
      CHHapticEvent(
        eventType: .hapticTransient,
        parameters: [
          CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.24),
          CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.26)
        ],
        relativeTime: 0.18
      ),
      CHHapticEvent(
        eventType: .hapticContinuous,
        parameters: [
          CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.2),
          CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.46)
        ],
        relativeTime: 0.24,
        duration: 0.1
      ),
      CHHapticEvent(
        eventType: .hapticTransient,
        parameters: [
          CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.98),
          CHHapticEventParameter(parameterID: .hapticSharpness, value: 1)
        ],
        relativeTime: 0.42
      ),
      CHHapticEvent(
        eventType: .hapticTransient,
        parameters: [
          CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.18),
          CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.82)
        ],
        relativeTime: 0.48
      )
    ]

    let curve = [
      CHHapticParameterCurve.ControlPoint(relativeTime: 0, value: 0.06),
      CHHapticParameterCurve.ControlPoint(relativeTime: 0.12, value: 0.18),
      CHHapticParameterCurve.ControlPoint(relativeTime: 0.24, value: 0.38),
      CHHapticParameterCurve.ControlPoint(relativeTime: 0.34, value: 0.12)
    ]

    let pattern = try CHHapticPattern(
      events: events,
      parameterCurves: [
        CHHapticParameterCurve(
          parameterID: .hapticIntensityControl,
          controlPoints: curve,
          relativeTime: 0
        )
      ]
    )
    let player = try engine.makePlayer(with: pattern)
    try player.start(atTime: 0)
  }
}
