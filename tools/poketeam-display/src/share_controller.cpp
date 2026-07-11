#include "poketeam/share_controller.hpp"

#include <QClipboard>
#include <QGuiApplication>

namespace poketeam {

bool ShareController::savePng(const QImage& image, const QString& path, QString* errorMessage) const
{
    if (image.isNull()) {
        if (errorMessage) *errorMessage = QStringLiteral("没有可导出的图片");
        return false;
    }
    if (!image.save(path, "PNG")) {
        if (errorMessage) *errorMessage = QStringLiteral("PNG 写入失败：%1").arg(path);
        return false;
    }
    return true;
}

void ShareController::copyImageToClipboard(const QImage& image) const
{
    QGuiApplication::clipboard()->setImage(image);
}

} // namespace poketeam
