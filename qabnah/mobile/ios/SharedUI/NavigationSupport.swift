import SwiftUI
import UIKit

/// Screens that draw their own header over a photo hide the navigation bar, which normally also
/// switches off the edge-swipe "back" gesture. Keeping the navigation controller as the gesture's
/// delegate leaves the swipe available whenever there is something to go back to.
extension UINavigationController: UIGestureRecognizerDelegate {
    override open func viewDidLoad() {
        super.viewDidLoad()
        interactivePopGestureRecognizer?.delegate = self
    }

    public func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        viewControllers.count > 1
    }
}

/// Vertical scroll position of a screen's header in a named coordinate space (0 at rest,
/// negative once scrolled up).
struct QScrollOffsetKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

extension View {
    /// Reports this view's `minY` in the named coordinate space through `QScrollOffsetKey`.
    func qReportScrollOffset(in space: String) -> some View {
        background(
            GeometryReader { geo in
                Color.clear.preference(key: QScrollOffsetKey.self, value: geo.frame(in: .named(space)).minY)
            }
        )
    }
}
