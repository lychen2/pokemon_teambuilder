#include "poketeam/team_parser.hpp"

#include <QRegularExpression>

#include <algorithm>
#include <cmath>

namespace poketeam {
namespace {

const QStringList kStats = {
    QStringLiteral("hp"), QStringLiteral("atk"), QStringLiteral("def"),
    QStringLiteral("spa"), QStringLiteral("spd"), QStringLiteral("spe"),
};

QString normalizeImportText(QString text)
{
    text.replace(QStringLiteral("\r"), QString());
    text.replace(QStringLiteral("\t"), QStringLiteral("  "));
    if (text.startsWith(QChar(0xFEFF))) text.remove(0, 1);
    return text;
}

QString statName(const QString& raw)
{
    static const QHash<QString, QString> stats = {
        {QStringLiteral("HP"), QStringLiteral("hp")}, {QStringLiteral("Atk"), QStringLiteral("atk")},
        {QStringLiteral("Def"), QStringLiteral("def")}, {QStringLiteral("SpA"), QStringLiteral("spa")},
        {QStringLiteral("SpD"), QStringLiteral("spd")}, {QStringLiteral("Spe"), QStringLiteral("spe")},
    };
    return stats.value(raw);
}

void setStat(StatSpread& spread, const QString& stat, int value)
{
    if (stat == QStringLiteral("hp")) spread.hp = value;
    if (stat == QStringLiteral("atk")) spread.atk = value;
    if (stat == QStringLiteral("def")) spread.def = value;
    if (stat == QStringLiteral("spa")) spread.spa = value;
    if (stat == QStringLiteral("spd")) spread.spd = value;
    if (stat == QStringLiteral("spe")) spread.spe = value;
}

int statValue(const StatSpread& spread, const QString& stat)
{
    if (stat == QStringLiteral("hp")) return spread.hp;
    if (stat == QStringLiteral("atk")) return spread.atk;
    if (stat == QStringLiteral("def")) return spread.def;
    if (stat == QStringLiteral("spa")) return spread.spa;
    if (stat == QStringLiteral("spd")) return spread.spd;
    if (stat == QStringLiteral("spe")) return spread.spe;
    return 0;
}

int spreadTotal(const StatSpread& spread)
{
    return spread.hp + spread.atk + spread.def + spread.spa + spread.spd + spread.spe;
}

StatSpread defaultPoints()
{
    return {.hp = 0, .atk = 32, .def = 0, .spa = 32, .spd = 0, .spe = 2};
}

int clampPoint(int value)
{
    return std::clamp(value, 0, 32);
}

StatSpread sanitizePoints(StatSpread spread)
{
    for (const auto& stat : kStats) {
        setStat(spread, stat, clampPoint(statValue(spread, stat)));
    }
    return spread;
}

StatSpread evsToPoints(const StatSpread& evs)
{
    StatSpread result;
    for (const auto& stat : kStats) {
        setStat(result, stat, clampPoint(static_cast<int>(std::floor((statValue(evs, stat) + 4) / 8.0))));
    }
    return result;
}

StatSpread normalizePoints(const StatSpread& spread)
{
    const auto total = spreadTotal(spread);
    if (!total) return defaultPoints();
    if (total == 508 || total == 510 || total > 66) return evsToPoints(spread);
    return sanitizePoints(spread);
}

StatSpread createEvsFromPoints(const StatSpread& points)
{
    StatSpread evs;
    for (const auto& stat : kStats) {
        setStat(evs, stat, statValue(points, stat) * 8);
    }
    return evs;
}

StatSpread parseStatLine(const QString& line, const QString& prefix)
{
    StatSpread spread;
    const auto pieces = QStringView(line).mid(prefix.size()).toString().split('/');
    static const QRegularExpression pattern(QStringLiteral(R"(^\s*(\d+)\s*([A-Za-z]+)\s*$)"));
    for (const auto& piece : pieces) {
        const auto match = pattern.match(piece.trimmed());
        if (!match.hasMatch()) continue;
        const auto stat = statName(match.captured(2));
        if (!stat.isEmpty()) setStat(spread, stat, match.captured(1).toInt());
    }
    return spread;
}

QString prefixedValue(const QString& line, const QString& label)
{
    const auto prefix = label + QStringLiteral(":");
    if (!line.startsWith(prefix)) return {};
    return QStringView(line).mid(prefix.size()).toString().trimmed();
}

QString extractSpeciesName(QString firstLine)
{
    const auto atParts = firstLine.split(QRegularExpression(QStringLiteral("\\s*@\\s*")));
    auto left = atParts.value(0).trimmed();
    left.replace(QRegularExpression(QStringLiteral("\\s+\\((M|F)\\)$")), QString());
    static const QRegularExpression nicknamePattern(QStringLiteral(R"(^(.+?)\s+\((.+)\)$)"));
    const auto match = nicknamePattern.match(left);
    return match.hasMatch() ? match.captured(2).trimmed() : left.trimmed();
}

QString extractGender(const QString& firstLine)
{
    static const QRegularExpression genderPattern(QStringLiteral(R"(\s\((M|F)\)(?:\s*@|\s*$))"));
    const auto match = genderPattern.match(firstLine);
    return match.hasMatch() ? match.captured(1) : QStringLiteral("F");
}

double natureMultiplier(const DataRepository& data, const QString& nature, Stat stat)
{
    if (data.natureBoost(nature) == stat) return 1.1;
    if (data.natureDrop(nature) == stat) return 0.9;
    return 1.0;
}

int applyNature(int value, const DataRepository& data, const QString& nature, Stat stat)
{
    return static_cast<int>(std::floor(value * natureMultiplier(data, nature, stat)));
}

StatSpread calculateStats(const PokemonRecord& pokemon, const StatSpread& points, const DataRepository& data, const QString& nature)
{
    StatSpread stats;
    stats.hp = pokemon.baseStats.hp + 75 + points.hp;
    stats.atk = applyNature(pokemon.baseStats.atk + 20 + points.atk, data, nature, Stat::Atk);
    stats.def = applyNature(pokemon.baseStats.def + 20 + points.def, data, nature, Stat::Def);
    stats.spa = applyNature(pokemon.baseStats.spa + 20 + points.spa, data, nature, Stat::Spa);
    stats.spd = applyNature(pokemon.baseStats.spd + 20 + points.spd, data, nature, Stat::Spd);
    stats.spe = applyNature(pokemon.baseStats.spe + 20 + points.spe, data, nature, Stat::Spe);
    return stats;
}

QString moveCategory(const std::optional<NamedRecord>& record)
{
    if (!record || record->category.isEmpty()) return QStringLiteral("Status");
    return record->category;
}

} // namespace

TeamParser::TeamParser(const DataRepository& data)
    : data_(data)
{
}

ParseResult TeamParser::parseShowdownText(const QString& text) const
{
    ParseResult result;
    const auto blocks = normalizeImportText(text).split(QRegularExpression(QStringLiteral("\\n\\s*\\n")), Qt::SkipEmptyParts);
    int index = 0;
    for (const auto& block : blocks) {
        ++index;
        QStringList lines;
        for (const auto& rawLine : block.split('\n')) {
            const auto line = rawLine.trimmed();
            if (!line.isEmpty()) lines.append(line);
        }
        if (lines.isEmpty()) continue;

        const auto header = lines.first();
        const auto speciesLabel = extractSpeciesName(header);
        const auto pokemon = data_.pokemonByName(speciesLabel);
        if (!pokemon) {
            result.errors.append(QStringLiteral("invalid-block-header:%1:%2").arg(index).arg(speciesLabel));
            continue;
        }

        const auto headerParts = header.split(QRegularExpression(QStringLiteral("\\s*@\\s*")));
        TeamMember member;
        member.id = QStringLiteral("custom:%1:%2").arg(pokemon->id).arg(index - 1);
        member.speciesId = pokemon->id;
        member.englishName = pokemon->englishName;
        member.localizedName = pokemon->localizedName;
        member.gender = extractGender(header);
        member.item = headerParts.value(1).trimmed();
        member.localizedItem = member.item;
        member.ability.clear();
        member.nature = QStringLiteral("Hardy");
        member.localizedNature = data_.localizedNature(member.nature);
        member.level = 50;
        member.types = pokemon->types;
        member.iconPath = pokemon->iconPath;
        StatSpread evs;
        StatSpread points;
        bool hasPoints = false;
        bool hasEvs = false;

        for (const auto& line : lines.mid(1)) {
            const auto ability = prefixedValue(line, QStringLiteral("Ability"));
            if (!ability.isEmpty()) {
                member.ability = ability;
                continue;
            }
            const auto level = prefixedValue(line, QStringLiteral("Level"));
            if (!level.isEmpty()) {
                member.level = level.toInt() > 0 ? level.toInt() : member.level;
                continue;
            }
            if (!prefixedValue(line, QStringLiteral("EVs")).isEmpty()) {
                evs = parseStatLine(line, QStringLiteral("EVs:"));
                hasEvs = true;
                continue;
            }
            if (!prefixedValue(line, QStringLiteral("Points")).isEmpty()) {
                points = parseStatLine(line, QStringLiteral("Points:"));
                hasPoints = true;
                continue;
            }
            if (line.endsWith(QStringLiteral(" Nature"))) {
                member.nature = QStringView(line).left(line.size() - 7).toString().trimmed();
                member.localizedNature = data_.localizedNature(member.nature);
                continue;
            }
            if (line.startsWith(QStringLiteral("-"))) {
                const auto moveName = QStringView(line).mid(1).toString().trimmed();
                const auto moveRecord = data_.moveByName(moveName);
                Move move;
                move.id = moveRecord ? moveRecord->id : data_.normalizeName(moveName);
                move.englishName = moveRecord ? moveRecord->englishName : moveName;
                move.localizedName = moveRecord ? moveRecord->localizedName : moveName;
                move.type = moveRecord ? moveRecord->type : QString();
                move.category = moveCategory(moveRecord);
                move.basePower = moveRecord ? moveRecord->basePower : 0;
                if (!moveRecord) member.warnings.append(QStringLiteral("unknown-move:%1").arg(moveName));
                member.moves.append(move);
                continue;
            }
            if (line.startsWith(QStringLiteral("IVs:")) || line.startsWith(QStringLiteral("Happiness:")) || line.startsWith(QStringLiteral("Shiny:")) || line.startsWith(QStringLiteral("Tera Type:"))) {
                member.warnings.append(QStringLiteral("ignored-line:%1").arg(line));
            }
        }

        if (!member.item.isEmpty()) {
            const auto item = data_.itemByName(member.item);
            if (item) {
                member.item = item->englishName;
                member.localizedItem = item->localizedName;
                member.itemSpriteNumber = item->spriteNumber;
            } else {
                member.warnings.append(QStringLiteral("unknown-item:%1").arg(member.item));
            }
        }
        if (!member.ability.isEmpty()) {
            const auto ability = data_.abilityByName(member.ability);
            if (ability) {
                member.ability = ability->englishName;
                member.localizedAbility = ability->localizedName;
            } else {
                member.localizedAbility = member.ability;
                member.warnings.append(QStringLiteral("unknown-ability:%1").arg(member.ability));
            }
        }
        if (member.localizedAbility.isEmpty()) member.localizedAbility = member.ability;

        member.points = hasPoints ? normalizePoints(points) : (hasEvs ? normalizePoints(evs) : defaultPoints());
        member.calculatedStats = calculateStats(*pokemon, member.points, data_, member.nature);
        result.team.members.append(member);
    }
    if (result.team.members.size() > 6) {
        result.warnings.append(QStringLiteral("只展示前 6 只"));
        while (result.team.members.size() > 6) result.team.members.removeLast();
    }
    return result;
}

} // namespace poketeam
