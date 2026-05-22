require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name = 'QulteHaptics'
  s.version = package['version']
  s.summary = 'Native haptic signatures for Qulte.'
  s.description = 'Custom Core Haptics patterns used by Qulte.'
  s.license = 'UNLICENSED'
  s.author = 'Qulte'
  s.homepage = 'https://qulte.app'
  s.platforms = { :ios => '15.1' }
  s.swift_version = '5.9'
  s.source = { :git => 'https://github.com/aux-ngls/WeChoose-app.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
  s.source_files = "**/*.{h,m,mm,swift}"
end
