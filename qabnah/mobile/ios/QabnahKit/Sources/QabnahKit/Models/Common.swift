import Foundation

/// `LatLng` — WGS-84.
public struct LatLng: Codable, Hashable, Sendable {
    public var lat: Double
    public var lng: Double
    public init(lat: Double, lng: Double) {
        self.lat = lat
        self.lng = lng
    }

    /// Great-circle distance in metres (haversine). Used for client-side hints only;
    /// the server is authoritative for fees and distances.
    public func distance(to other: LatLng) -> Double {
        let r = 6_371_000.0
        let dLat = (other.lat - lat) * .pi / 180
        let dLng = (other.lng - lng) * .pi / 180
        let a = sin(dLat / 2) * sin(dLat / 2)
            + cos(lat * .pi / 180) * cos(other.lat * .pi / 180) * sin(dLng / 2) * sin(dLng / 2)
        return 2 * r * atan2(sqrt(a), sqrt(1 - a))
    }

    /// Muscat city centre — a sensible map default before location permission is granted.
    public static let muscat = LatLng(lat: 23.5880, lng: 58.3829)
}

/// Paged list response `{items, total, limit, offset}`.
public struct Page<T: Codable & Hashable>: Codable, Hashable {
    @DefaultEmpty public var items: [T]
    public var total: Int?
    public var limit: Int?
    public var offset: Int?

    public init(items: [T], total: Int? = nil, limit: Int? = nil, offset: Int? = nil) {
        self.items = items
        self.total = total
        self.limit = limit
        self.offset = offset
    }

    /// True when more items exist after this page.
    public var hasMore: Bool {
        guard let total else { return false }
        return (offset ?? 0) + items.count < total
    }
}

/// `{items: [...]}` responses without paging metadata.
public struct ItemsResponse<T: Codable & Hashable>: Codable, Hashable {
    @DefaultEmpty public var items: [T]
    public var total: Int?
    public init(items: [T], total: Int? = nil) {
        self.items = items
        self.total = total
    }
}

/// Response type for endpoints that return 204 / an ignorable body.
public struct EmptyResponse: Codable, Hashable, Sendable {
    public init() {}
}

/// `FileRef` returned by `POST /files`.
public struct FileRef: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var url: String?
    public var mimeType: String?
    public var sizeBytes: Int?
}

/// `Zone` from `GET /zones`.
public struct Zone: Codable, Hashable, Identifiable, Sendable, BilingualNamed {
    public var id: String
    @DefaultEmptyString public var code: String
    @DefaultEmptyString public var nameEn: String
    @DefaultEmptyString public var nameAr: String
    @DefaultFalse public var isActive: Bool
    /// GeoJSON Polygon, coordinates `[lng, lat]`.
    public var boundary: JSONValue?
}
