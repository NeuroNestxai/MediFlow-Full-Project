import SwiftUI
import PhotosUI
import UIKit

/// Camera capture via `UIImagePickerController` (PhotosPicker covers the library).
struct CameraPicker: UIViewControllerRepresentable {
    @Environment(\.dismiss) var dismiss
    let onImage: (UIImage) -> Void

    static var isAvailable: Bool { UIImagePickerController.isSourceTypeAvailable(.camera) }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraPicker
        init(_ parent: CameraPicker) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage { parent.onImage(image) }
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.dismiss()
        }
    }
}

extension UIImage {
    /// Downscaled JPEG (longest side ≤ `maxDimension`) for uploads.
    func uploadJPEG(maxDimension: CGFloat = 1600, quality: CGFloat = 0.75) -> Data? {
        let longest = max(size.width, size.height)
        let scale = longest > maxDimension ? maxDimension / longest : 1
        let target = CGSize(width: size.width * scale, height: size.height * scale)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let resized = UIGraphicsImageRenderer(size: target, format: format).image { _ in
            draw(in: CGRect(origin: .zero, size: target))
        }
        return resized.jpegData(compressionQuality: quality)
    }
}

/// Camera / library buttons + thumbnail.
struct PhotoInput: View {
    @EnvironmentObject var lang: LanguageSettings
    @Binding var image: UIImage?
    @State private var showCamera = false
    @State private var pickerItem: PhotosPickerItem? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(height: 180)
                    .frame(maxWidth: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: Brand.radiusMd))
                    .overlay(alignment: .topTrailing) {
                        Button { self.image = nil } label: {
                            QCircleIcon(systemImage: "xmark", size: 32)
                        }
                        .padding(6)
                        .accessibilityLabel(lang.t("photo.remove"))
                    }
            }
            HStack {
                if CameraPicker.isAvailable {
                    Button { showCamera = true } label: { Label(lang.t("photo.camera"), systemImage: "camera") }
                        .buttonStyle(SecondaryButtonStyle())
                }
                PhotosPicker(selection: $pickerItem, matching: .images) {
                    Label(lang.t("photo.library"), systemImage: "photo.on.rectangle")
                        .qFont(.h3)
                        .foregroundColor(QTheme.ink)
                        .frame(maxWidth: .infinity, minHeight: QTheme.buttonHeight)
                        .padding(.horizontal, QTheme.space4)
                        .background(QTheme.surface)
                        .clipShape(RoundedRectangle(cornerRadius: QTheme.radiusButton, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: QTheme.radiusButton, style: .continuous).stroke(QTheme.line, lineWidth: 1))
                }
            }
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker { image = $0 }.ignoresSafeArea()
        }
        .onChange(of: pickerItem) { item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self), let img = UIImage(data: data) {
                    image = img
                }
                pickerItem = nil
            }
        }
    }
}
