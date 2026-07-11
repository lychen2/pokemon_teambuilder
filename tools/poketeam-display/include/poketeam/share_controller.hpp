#pragma once

#include <QImage>
#include <QString>

namespace poketeam {

class ShareController {
public:
    bool savePng(const QImage& image, const QString& path, QString* errorMessage) const;
    void copyImageToClipboard(const QImage& image) const;
};

} // namespace poketeam
