package org.perkeep.mobile.upload

import androidx.core.content.FileProvider

/**
 * FileProvider riêng của plugin.
 *
 * App Capacitor đã khai sẵn một FileProvider (authority `<package>.fileprovider`).
 * Nếu plugin khai thêm provider cùng `android:name` thì manifest merger báo lỗi
 * trùng attribute -> phải dùng lớp con với tên khác, authority riêng.
 */
class PkFileProvider : FileProvider()
