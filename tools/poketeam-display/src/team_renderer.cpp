#include "poketeam/team_renderer.hpp"

#include <QApplication>
#include <QFontDatabase>
#include <QLinearGradient>
#include <QPainter>
#include <QPainterPath>
#include <QPen>
#include <QPixmap>
#include <QRadialGradient>

#include <QDir>
#include <QFile>

#include <algorithm>

namespace poketeam {
namespace {

QString fontFamily()
{
    const auto families = QFontDatabase::families();
    if (families.contains(QStringLiteral("Maple Mono NF CN"))) return QStringLiteral("Maple Mono NF CN");
    if (families.contains(QStringLiteral("Maple Mono NF CN Light"))) return QStringLiteral("Maple Mono NF CN Light");
    if (families.contains(QStringLiteral("Noto Sans CJK SC"))) return QStringLiteral("Noto Sans CJK SC");
    if (families.contains(QStringLiteral("Microsoft YaHei"))) return QStringLiteral("Microsoft YaHei");
    return QApplication::font().family();
}

QString displaySpeciesName(const QString& localizedName)
{
    return localizedName.split(QChar(0x2011)).first().split(QChar(0x2010)).first().split(QChar(0x2013)).first().split(QChar(0x2014)).first().split('-').first();
}

QColor typeColor(const QString& type)
{
    static const QHash<QString, QColor> colors = {
        {QStringLiteral("Electric"), QColor(247, 207, 58)}, {QStringLiteral("Grass"), QColor(88, 190, 76)},
        {QStringLiteral("Poison"), QColor(168, 92, 192)}, {QStringLiteral("Fire"), QColor(238, 94, 64)},
        {QStringLiteral("Ghost"), QColor(94, 82, 170)}, {QStringLiteral("Fairy"), QColor(238, 126, 202)},
        {QStringLiteral("Ice"), QColor(109, 205, 222)}, {QStringLiteral("Dark"), QColor(84, 70, 72)},
        {QStringLiteral("Normal"), QColor(170, 168, 150)}, {QStringLiteral("Fighting"), QColor(194, 72, 68)},
        {QStringLiteral("Flying"), QColor(138, 168, 232)}, {QStringLiteral("Ground"), QColor(214, 174, 89)},
        {QStringLiteral("Rock"), QColor(183, 160, 82)}, {QStringLiteral("Bug"), QColor(157, 184, 54)},
        {QStringLiteral("Steel"), QColor(153, 160, 180)}, {QStringLiteral("Water"), QColor(78, 146, 220)},
        {QStringLiteral("Psychic"), QColor(238, 92, 142)}, {QStringLiteral("Dragon"), QColor(104, 92, 222)},
    };
    return colors.value(type, QColor(160, 150, 190));
}

QString typeShortLabel(const QString& type, const DataRepository& data)
{
    if (type == QStringLiteral("Normal")) return QStringLiteral("普");
    return data.typeLabel(type).left(1);
}

QString elide(QPainter& painter, const QString& text, int width)
{
    return painter.fontMetrics().elidedText(text, Qt::ElideRight, width);
}
QString championsUiIconPath(const DataRepository& data, const QString& category, const QString& name)
{
    return QDir(data.assetRoot()).filePath(QStringLiteral("champions-ui/%1/%2.webp").arg(category, name.toLower()));
}

bool drawImageIcon(QPainter& painter, const QRect& rect, const QString& path)
{
    const QPixmap icon(path);
    if (icon.isNull()) return false;
    painter.save();
    painter.setRenderHint(QPainter::SmoothPixmapTransform, true);
    painter.drawPixmap(rect, icon, icon.rect());
    painter.restore();
    return true;
}

QString statIconName(Stat stat)
{
    switch (stat) {
    case Stat::Hp: return QStringLiteral("hp");
    case Stat::Atk: return QStringLiteral("atk");
    case Stat::Def: return QStringLiteral("def");
    case Stat::Spa: return QStringLiteral("spa");
    case Stat::Spd: return QStringLiteral("spd");
    case Stat::Spe: return QStringLiteral("spe");
    }
    return {};
}

QString natureAlignmentIconName(const QString& arrow)
{
    if (arrow == QStringLiteral("↑")) return QStringLiteral("plus");
    if (arrow == QStringLiteral("↓")) return QStringLiteral("minus");
    return {};
}

int statPoint(const StatSpread& spread, Stat stat)
{
    switch (stat) {
    case Stat::Hp: return spread.hp;
    case Stat::Atk: return spread.atk;
    case Stat::Def: return spread.def;
    case Stat::Spa: return spread.spa;
    case Stat::Spd: return spread.spd;
    case Stat::Spe: return spread.spe;
    }
    return 0;
}

int statActual(const StatSpread& spread, Stat stat)
{
    return statPoint(spread, stat);
}

QString natureArrow(const DataRepository& data, const QString& nature, Stat stat)
{
    if (data.natureBoost(nature) == stat) return QStringLiteral("↑");
    if (data.natureDrop(nature) == stat) return QStringLiteral("↓");
    return {};
}

QColor natureArrowColor(const QString& arrow)
{
    if (arrow == QStringLiteral("↑")) return QColor(238, 92, 104);
    if (arrow == QStringLiteral("↓")) return QColor(132, 198, 255);
    return QColor(245, 240, 255);
}

void drawBackground(QPainter& painter, const DataRepository& data)
{
    const QRect canvas(0, 0, 2622, 1206);
    const QPixmap source(championsUiIconPath(data, QStringLiteral("backgrounds"), QStringLiteral("background")));
    if (!source.isNull()) {
        painter.save();
        painter.setRenderHint(QPainter::SmoothPixmapTransform, true);
        const QSize scaled = source.size().scaled(canvas.size(), Qt::KeepAspectRatioByExpanding);
        const QRect target((canvas.width() - scaled.width()) / 2, (canvas.height() - scaled.height()) / 2, scaled.width(), scaled.height());
        painter.drawPixmap(target, source, source.rect());
        painter.restore();
        return;
    }

    QLinearGradient background(0, 0, 2622, 1206);
    background.setColorAt(0.0, QColor(255, 241, 149));
    background.setColorAt(0.44, QColor(236, 197, 84));
    background.setColorAt(1.0, QColor(199, 143, 38));
    painter.fillRect(canvas, background);
}

void drawPanel(QPainter& painter, const QRect& rect, int radius, const QColor& color)
{
    painter.save();
    QPainterPath shadow;
    shadow.addRoundedRect(rect.adjusted(8, 8, 8, 8), radius, radius);
    painter.fillPath(shadow, QColor(72, 52, 130, 80));
    QPainterPath path;
    path.addRoundedRect(rect, radius, radius);
    painter.fillPath(path, color);
    painter.strokePath(path, QPen(QColor(228, 221, 255, 92), 2));
    painter.restore();
}

void drawTopIconButton(QPainter& painter, const QRect& rect, const QString& kind)
{
    drawPanel(painter, rect, 20, QColor(238, 234, 247, 235));
    painter.save();
    painter.setPen(QPen(QColor(83, 99, 155), 7, Qt::SolidLine, Qt::RoundCap, Qt::RoundJoin));
    if (kind == QStringLiteral("back")) {
        painter.drawLine(rect.center().x() + 10, rect.center().y() - 18, rect.center().x() - 12, rect.center().y());
        painter.drawLine(rect.center().x() - 12, rect.center().y(), rect.center().x() + 10, rect.center().y() + 18);
        painter.drawLine(rect.center().x() - 10, rect.center().y(), rect.center().x() + 22, rect.center().y());
    } else {
        for (int i = 0; i < 3; ++i) painter.drawLine(rect.x() + 22, rect.y() + 18 + i * 17, rect.right() - 20, rect.y() + 18 + i * 17);
        painter.setBrush(QColor(83, 99, 155));
        painter.setPen(Qt::NoPen);
        for (int i = 0; i < 3; ++i) painter.drawEllipse(QPoint(rect.x() + 14, rect.y() + 18 + i * 17), 4, 4);
    }
    painter.restore();
}

void drawSegmentControl(QPainter& painter, RenderPage page)
{
    painter.save();
    const QRect shell(846, 180, 930, 60);
    painter.setPen(Qt::NoPen);
    painter.setBrush(QColor(166, 175, 242));
    painter.drawRoundedRect(shell, 30, 30);
    const QRect active = page == RenderPage::Abilities ? QRect(846, 180, 475, 60) : QRect(1301, 180, 475, 60);
    QLinearGradient activeGradient(active.topLeft(), active.bottomRight());
    activeGradient.setColorAt(0, QColor(236, 244, 97));
    activeGradient.setColorAt(1, QColor(171, 224, 73));
    painter.setBrush(activeGradient);
    painter.drawRoundedRect(active, 30, 30);
    painter.setPen(QPen(QColor(255, 255, 255, 125), 2));
    painter.drawRoundedRect(shell.adjusted(1, 1, -1, -1), 29, 29);
    painter.setFont(QFont(fontFamily(), 31, QFont::DemiBold));
    painter.setPen(page == RenderPage::Abilities ? QColor(54, 74, 144) : QColor(239, 250, 255));
    painter.drawText(QRect(846, 180, 475, 60), Qt::AlignCenter, QStringLiteral("能力"));
    painter.setPen(page == RenderPage::Stats ? QColor(54, 74, 144) : QColor(239, 250, 255));
    painter.drawText(QRect(1301, 180, 475, 60), Qt::AlignCenter, QStringLiteral("状态"));
    painter.restore();
}

void drawCardPanel(QPainter& painter, const QRect& rect, int index)
{
    painter.save();
    QPainterPath shadow;
    shadow.addRoundedRect(rect.adjusted(8, 12, 8, 12), 20, 20);
    painter.fillPath(shadow, QColor(0, 0, 0, 54));

    QPainterPath path;
    path.addRoundedRect(rect, 20, 20);
    QLinearGradient gradient(rect.topLeft(), rect.bottomRight());
    gradient.setColorAt(0, QColor(88, 84, 193));
    gradient.setColorAt(0.52, QColor(118, 111, 185));
    gradient.setColorAt(0.53, QColor(141, 135, 221));
    gradient.setColorAt(1, QColor(102, 91, 202));
    painter.fillPath(path, gradient);

    painter.setClipPath(path);
    painter.fillRect(rect.adjusted(0, rect.height() / 2, 0, 0), QColor(255, 255, 255, 18));
    painter.setPen(QPen(QColor(255, 255, 255, 22), 1.5));
    for (int y = rect.y() + 8; y < rect.bottom(); y += 8) painter.drawLine(rect.x() + 10, y, rect.right() - 10, y);
    QRadialGradient bloom(rect.x() + rect.width() * 0.2, rect.y() + rect.height() * 0.12, rect.width() * 0.42);
    bloom.setColorAt(0, QColor(255, 255, 255, 46));
    bloom.setColorAt(1, QColor(255, 255, 255, 0));
    painter.fillRect(rect, bloom);
    painter.setClipping(false);

    painter.strokePath(path, QPen(QColor(197, 189, 247), 3));
    painter.strokePath(path.translated(0, -2), QPen(QColor(255, 255, 255, 82), 1));
    painter.setFont(QFont(fontFamily(), 86, QFont::Black));
    painter.setPen(QColor(255, 255, 255, 24));
    painter.drawText(rect.adjusted(0, 24, -28, -8), Qt::AlignRight | Qt::AlignBottom, QString::number(index + 1));
    painter.restore();
}

void drawPokemonIcon(QPainter& painter, const TeamMember& member, const QRect& rect)
{
    painter.save();
    QPixmap pixmap(member.iconPath);
    if (!pixmap.isNull()) painter.drawPixmap(rect, pixmap, pixmap.rect());
    else {
        painter.setBrush(QColor(246, 229, 132));
        painter.setPen(Qt::NoPen);
        painter.drawEllipse(rect);
        painter.setPen(QColor(90, 72, 145));
        painter.setFont(QFont(fontFamily(), std::max(24, rect.height() / 3), QFont::DemiBold));
        painter.drawText(rect, Qt::AlignCenter, displaySpeciesName(member.localizedName).left(1));
    }
    painter.restore();
}

void drawTypePill(QPainter& painter, const QRect& rect, const QString& type, const DataRepository& data)
{
    if (drawImageIcon(painter, rect, championsUiIconPath(data, QStringLiteral("types"), type))) return;
    painter.save();
    const QColor base = typeColor(type);
    QLinearGradient gradient(rect.topLeft(), rect.bottomRight());
    gradient.setColorAt(0, base.lighter(165));
    gradient.setColorAt(0.28, base.lighter(124));
    gradient.setColorAt(0.72, base);
    gradient.setColorAt(1, base.darker(135));
    painter.setBrush(gradient);
    painter.setPen(QPen(QColor(255, 255, 255, 128), 1));
    painter.drawRoundedRect(rect, 4, 4);
    painter.setPen(QColor(255, 255, 255));
    painter.setFont(QFont(fontFamily(), rect.height() <= 26 ? 13 : 15, QFont::Bold));
    painter.drawText(rect, Qt::AlignCenter, typeShortLabel(type, data));
    painter.restore();
}

QString itemIconSheetPath(const DataRepository& data)
{
    const QDir root(data.assetRoot());
    const QStringList candidates = {
        root.filePath(QStringLiteral("itemicons-sheet.png")),
        root.filePath(QStringLiteral("static/itemicons-sheet.png")),
    };
    for (const auto& candidate : candidates) {
        if (QFile::exists(candidate)) return candidate;
    }
    return {};
}

QRect itemSpriteSourceRect(int spriteNumber)
{
    const int column = spriteNumber % 16;
    const int row = spriteNumber / 16;
    return QRect(column * 24, row * 24, 24, 24);
}

void drawItemPlaceholder(QPainter& painter, const QRect& rect)
{
    painter.save();
    painter.setRenderHint(QPainter::Antialiasing);
    QLinearGradient frame(rect.topLeft(), rect.bottomRight());
    frame.setColorAt(0, QColor(246, 238, 184));
    frame.setColorAt(1, QColor(160, 116, 70));
    painter.setBrush(frame);
    painter.setPen(QPen(QColor(84, 63, 120, 120), 1));
    painter.drawRoundedRect(rect, 6, 6);
    const QRect gem = rect.adjusted(6, 5, -6, -5);
    QRadialGradient gradient(gem.center(), gem.width() / 2);
    gradient.setColorAt(0, QColor(185, 255, 244));
    gradient.setColorAt(0.55, QColor(82, 196, 204));
    gradient.setColorAt(1, QColor(62, 88, 166));
    painter.setBrush(gradient);
    painter.setPen(QPen(QColor(255, 255, 255, 170), 1));
    painter.drawEllipse(gem);
    painter.restore();
}

void drawItemIcon(QPainter& painter, const QRect& rect, const DataRepository& data, const TeamMember& member)
{
    const QPixmap sheet(itemIconSheetPath(data));
    if (!sheet.isNull() && member.itemSpriteNumber >= 0) {
        painter.save();
        painter.setRenderHint(QPainter::SmoothPixmapTransform, false);
        painter.drawPixmap(rect, sheet, itemSpriteSourceRect(member.itemSpriteNumber));
        painter.restore();
        return;
    }
    drawItemPlaceholder(painter, rect);
}

void drawStatPointBar(QPainter& painter, const QRect& rect, int points)
{
    painter.save();
    painter.setPen(Qt::NoPen);
    painter.setBrush(QColor(71, 75, 122));
    painter.drawRoundedRect(rect, 5, 5);
    const int width = std::clamp(points, 0, 32) * rect.width() / 32;
    if (width > 0) {
        QRect fill = rect;
        fill.setWidth(width);
        painter.setBrush(QColor(235, 124, 7));
        painter.drawRoundedRect(fill, 5, 5);
    }
    painter.restore();
}
void drawGenderAndTera(QPainter& painter, const QRect& base, const TeamMember& member, const DataRepository& data)
{
    painter.save();
    const bool male = member.gender == QStringLiteral("M");
    const bool female = member.gender == QStringLiteral("F");
    if (male || female) {
        const QRect genderRect(base.x(), base.y() + 1, 32, 32);
        if (!drawImageIcon(painter, genderRect, championsUiIconPath(data, QStringLiteral("gender"), member.gender))) {
            painter.setBrush(male ? QColor(0, 61, 233) : QColor(228, 0, 0));
            painter.setPen(Qt::NoPen);
            painter.drawEllipse(genderRect);
            painter.setPen(QColor(255, 255, 255));
            painter.setFont(QFont(fontFamily(), 20, QFont::Bold));
            painter.drawText(genderRect, Qt::AlignCenter, male ? QStringLiteral("♂") : QStringLiteral("♀"));
        }
    }
    const int typeStartX = male || female ? base.x() + 50 : base.x();
    const QStringList types = member.types.isEmpty() ? QStringList{QStringLiteral("Normal")} : member.types;
    for (int t = 0; t < types.size(); ++t) {
        drawTypePill(painter, QRect(typeStartX + t * 40, base.y() + 1, 32, 32), types[t], data);
    }
    painter.restore();
}

void drawStatIcon(QPainter& painter, const QRect& rect, Stat stat, const DataRepository& data)
{
    if (drawImageIcon(painter, rect, championsUiIconPath(data, QStringLiteral("stats"), statIconName(stat)))) return;
    painter.save();
    painter.setRenderHint(QPainter::Antialiasing);
    painter.setPen(Qt::NoPen);
    painter.setBrush(QColor(242, 246, 255, 230));
    const QPoint c = rect.center();
    if (stat == Stat::Hp) {
        QPainterPath heart;
        heart.moveTo(c.x(), rect.bottom() - 3);
        heart.cubicTo(rect.x() - 2, rect.y() + 10, rect.x() + 5, rect.y() - 1, c.x(), rect.y() + 7);
        heart.cubicTo(rect.right() - 5, rect.y() - 1, rect.right() + 2, rect.y() + 10, c.x(), rect.bottom() - 3);
        painter.drawPath(heart);
    } else if (stat == Stat::Atk) {
        painter.drawPolygon(QPolygon() << QPoint(c.x(), rect.y()) << QPoint(rect.right(), rect.bottom() - 3) << QPoint(c.x() + 3, rect.bottom() - 8) << QPoint(rect.x() + 2, rect.bottom()) << QPoint(c.x() - 3, c.y()));
    } else if (stat == Stat::Def) {
        painter.drawPolygon(QPolygon() << QPoint(c.x(), rect.y()) << QPoint(rect.right(), rect.y() + 6) << QPoint(rect.right() - 3, rect.bottom() - 4) << QPoint(c.x(), rect.bottom()) << QPoint(rect.x() + 3, rect.bottom() - 4) << QPoint(rect.x(), rect.y() + 6));
    } else if (stat == Stat::Spa) {
        painter.drawEllipse(rect.adjusted(4, 4, -4, -4));
        painter.setBrush(QColor(104, 84, 176, 218));
        painter.drawEllipse(rect.adjusted(8, 8, -8, -8));
    } else if (stat == Stat::Spd) {
        painter.drawRoundedRect(rect.adjusted(3, 4, -3, -4), 5, 5);
        painter.setBrush(QColor(104, 84, 176, 218));
        painter.drawRoundedRect(rect.adjusted(7, 8, -7, -8), 3, 3);
    } else {
        painter.setPen(QPen(QColor(242, 246, 255, 230), 4, Qt::SolidLine, Qt::RoundCap));
        painter.drawLine(rect.x() + 2, rect.y() + 6, rect.right() - 2, rect.y() + 6);
        painter.drawLine(rect.x() + 7, rect.center().y(), rect.right() - 8, rect.center().y());
        painter.drawLine(rect.x() + 2, rect.bottom() - 6, rect.right() - 2, rect.bottom() - 6);
    }
    painter.restore();
}

} // namespace

TeamRenderer::TeamRenderer(const DataRepository& data)
    : data_(data)
{
}

QImage TeamRenderer::render(const Team& team, const TeamSummary& summary, RenderPage page, QSize size) const
{
    Q_UNUSED(summary);
    QImage image(size, QImage::Format_ARGB32_Premultiplied);
    image.fill(Qt::transparent);
    QPainter painter(&image);
    painter.setRenderHint(QPainter::Antialiasing);
    painter.setRenderHint(QPainter::TextAntialiasing);

    painter.scale(size.width() / 2622.0, size.height() / 1206.0);
    drawBackground(painter, data_);

    drawPanel(painter, QRect(716, 78, 1190, 80), 6, QColor(119, 111, 185, 238));
    painter.setFont(QFont(fontFamily(), 31, QFont::DemiBold));
    painter.setPen(QColor(248, 244, 255));
    painter.drawText(QRect(748, 79, 360, 78), Qt::AlignCenter, team.slot);
    painter.drawText(QRect(1110, 79, 470, 78), Qt::AlignCenter, QStringLiteral("队伍ID：%1").arg(team.teamId));
    painter.drawText(QRect(1580, 79, 300, 78), Qt::AlignCenter, team.trainerName);

    drawSegmentControl(painter, page);

    const QList<QRect> cards = {
        QRect(300, 274, 980, 305), QRect(1330, 274, 980, 305),
        QRect(300, 566, 980, 305), QRect(1330, 566, 980, 305),
        QRect(300, 858, 980, 305), QRect(1330, 858, 980, 305),
    };
    for (int i = 0; i < cards.size(); ++i) {
        painter.save();
        drawCardPanel(painter, cards[i], i);
        if (i >= team.members.size()) {
            painter.setFont(QFont(fontFamily(), 38, QFont::DemiBold));
            painter.setPen(QColor(230, 224, 248));
            painter.drawText(cards[i], Qt::AlignCenter, QStringLiteral("未配置"));
            painter.restore();
            continue;
        }
        const auto& member = team.members[i];
        drawPokemonIcon(painter, member, QRect(cards[i].x() + 45, cards[i].y() + 28, 92, 92));
        painter.setFont(QFont(fontFamily(), 35, QFont::DemiBold));
        painter.setPen(QColor(255, 255, 255));
        const QRect nameRect(cards[i].x() + 145, cards[i].y() + 43, 300, 54);
        const QString displayName = elide(painter, displaySpeciesName(member.localizedName), nameRect.width());
        painter.drawText(nameRect, Qt::AlignVCenter, displayName);
        const int badgeX = std::min(cards[i].x() + 145 + painter.fontMetrics().horizontalAdvance(displayName) + 20, cards[i].x() + 418);
        drawGenderAndTera(painter, QRect(badgeX, cards[i].y() + 54, 70, 34), member, data_);

        if (page == RenderPage::Abilities) {
            painter.setFont(QFont(fontFamily(), 26));
            painter.setPen(QColor(255, 255, 255));
            painter.drawText(QRect(cards[i].x() + 145, cards[i].y() + 116, 330, 38), Qt::AlignVCenter, elide(painter, member.localizedAbility.isEmpty() ? QStringLiteral("无特性") : member.localizedAbility, 330));
            drawItemIcon(painter, QRect(cards[i].x() + 87, cards[i].y() + 169, 48, 48), data_, member);
            painter.drawText(QRect(cards[i].x() + 145, cards[i].y() + 174, 330, 38), Qt::AlignVCenter, elide(painter, member.localizedItem.isEmpty() ? QStringLiteral("无道具") : member.localizedItem, 330));
            const int moveX = cards[i].x() + 590;
            for (int moveIndex = 0; moveIndex < 4; ++moveIndex) {
                const QRect moveRect(moveX + 48, cards[i].y() + 48 + moveIndex * 55, 315, 38);
                if (moveIndex < member.moves.size()) {
                    drawTypePill(painter, QRect(moveX, moveRect.y() + 1, 36, 36), member.moves[moveIndex].type, data_);
                    painter.setPen(QColor(255, 255, 255));
                    painter.drawText(moveRect, Qt::AlignVCenter, elide(painter, member.moves[moveIndex].localizedName, moveRect.width()));
                }
            }
        } else {
            painter.setFont(QFont(fontFamily(), 23));
            const QList<QPair<QString, Stat>> statRows = {{QStringLiteral("HP"), Stat::Hp}, {QStringLiteral("攻击"), Stat::Atk}, {QStringLiteral("防御"), Stat::Def}, {QStringLiteral("特攻"), Stat::Spa}, {QStringLiteral("特防"), Stat::Spd}, {QStringLiteral("速度"), Stat::Spe}};
            for (int statIndex = 0; statIndex < statRows.size(); ++statIndex) {
                const int column = statIndex / 3;
                const int row = statIndex % 3;
                const auto stat = statRows[statIndex].second;
                const int x = cards[i].x() + 84 + column * 430;
                const int y = cards[i].y() + 116 + row * 52;
                const auto arrow = natureArrow(data_, member.nature, stat);
                drawStatIcon(painter, QRect(x, y + 2, 40, 40), stat, data_);
                painter.setPen(QColor(255, 255, 255));
                painter.drawText(QRect(x + 60, y, 86, 42), Qt::AlignVCenter | Qt::AlignLeft, statRows[statIndex].first);
                if (!arrow.isEmpty()) {
                    const QString alignmentIcon = natureAlignmentIconName(arrow);
                    if (!alignmentIcon.isEmpty()) {
                        drawImageIcon(painter, QRect(x + 132, y + 10, 20, 20), championsUiIconPath(data_, QStringLiteral("statalignment"), alignmentIcon));
                    }
                }
                painter.setPen(QColor(255, 255, 255));
                painter.drawText(QRect(x + 170, y, 70, 42), Qt::AlignVCenter | Qt::AlignRight, QString::number(statActual(member.calculatedStats, stat)));
                drawStatPointBar(painter, QRect(x + 260, y + 10, 88, 22), statPoint(member.points, stat));
                painter.setPen(QColor(255, 255, 255));
                painter.drawText(QRect(x + 360, y, 52, 42), Qt::AlignVCenter | Qt::AlignRight, QString::number(statPoint(member.points, stat)));
            }
        }
        painter.restore();
    }

    return image;
}

QImage TeamRenderer::renderShareImage(const Team& team, const TeamSummary& summary, QSize pageSize) const
{
    const auto abilities = render(team, summary, RenderPage::Abilities, pageSize);
    const auto stats = render(team, summary, RenderPage::Stats, pageSize);
    QImage image(pageSize.width(), pageSize.height() * 2, QImage::Format_ARGB32_Premultiplied);
    image.fill(Qt::transparent);
    QPainter painter(&image);
    painter.drawImage(0, 0, abilities);
    painter.drawImage(0, pageSize.height(), stats);
    return image;
}

} // namespace poketeam
