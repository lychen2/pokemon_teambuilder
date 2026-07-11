#include "poketeam/team_analyzer.hpp"

#include <QRegularExpression>
#include <QSet>

#include <algorithm>

namespace poketeam {
namespace {

bool hasMove(const TeamMember& member, const QString& id)
{
    for (const auto& move : member.moves) {
        if (move.id == id) return true;
    }
    return false;
}

bool hasAnyMove(const TeamMember& member, const QSet<QString>& ids)
{
    for (const auto& move : member.moves) {
        if (ids.contains(move.id)) return true;
    }
    return false;
}

bool hasWeatherPayoff(const TeamMember& member)
{
    static const QSet<QString> abilities = {QStringLiteral("chlorophyll"), QStringLiteral("swiftswim"), QStringLiteral("sandrush"), QStringLiteral("slushrush"), QStringLiteral("protosynthesis"), QStringLiteral("solarpower")};
    static const QSet<QString> moves = {QStringLiteral("weatherball"), QStringLiteral("solarbeam"), QStringLiteral("solarblade"), QStringLiteral("thunder"), QStringLiteral("hurricane"), QStringLiteral("hydrosteam")};
    const auto abilityId = QString(member.ability).toLower().remove(QRegularExpression(QStringLiteral("[^a-z0-9]+")));
    return abilities.contains(abilityId) || hasAnyMove(member, moves);
}

bool hasTerrainPayoff(const TeamMember& member)
{
    static const QSet<QString> moves = {QStringLiteral("grassyglide"), QStringLiteral("expandingforce"), QStringLiteral("risingvoltage"), QStringLiteral("terrainpulse")};
    return hasAnyMove(member, moves);
}

struct Roles {
    bool fakeout = false;
    bool trickroom = false;
    bool redirection = false;
    bool weather = false;
    bool terrain = false;
    bool speedcontrol = false;
    bool setupcarry = false;
    bool slowbreaker = false;
};

Roles rolesFor(const TeamMember& member)
{
    static const QSet<QString> weatherMoves = {QStringLiteral("sunnyday"), QStringLiteral("raindance"), QStringLiteral("sandstorm"), QStringLiteral("snowscape")};
    static const QSet<QString> weatherAbilities = {QStringLiteral("drought"), QStringLiteral("drizzle"), QStringLiteral("sandstream"), QStringLiteral("snowwarning")};
    static const QSet<QString> terrainMoves = {QStringLiteral("electricterrain"), QStringLiteral("grassyterrain"), QStringLiteral("psychicterrain"), QStringLiteral("mistyterrain")};
    static const QSet<QString> terrainAbilities = {QStringLiteral("electricsurge"), QStringLiteral("grassysurge"), QStringLiteral("psychicsurge"), QStringLiteral("mistysurge")};
    static const QSet<QString> speedMoves = {QStringLiteral("electroweb"), QStringLiteral("icywind"), QStringLiteral("thunderwave"), QStringLiteral("nuzzle"), QStringLiteral("glare"), QStringLiteral("stunspore"), QStringLiteral("tailwind"), QStringLiteral("trickroom")};
    static const QSet<QString> setupMoves = {QStringLiteral("swordsdance"), QStringLiteral("nastyplot"), QStringLiteral("quiverdance"), QStringLiteral("dragondance"), QStringLiteral("calmmind"), QStringLiteral("bulkup"), QStringLiteral("bellydrum"), QStringLiteral("coil")};
    const auto abilityId = QString(member.ability).toLower().remove(QRegularExpression(QStringLiteral("[^a-z0-9]+")));
    int attackMoves = 0;
    for (const auto& move : member.moves) {
        if (move.category != QStringLiteral("Status")) ++attackMoves;
    }
    Roles roles;
    roles.fakeout = hasMove(member, QStringLiteral("fakeout"));
    roles.trickroom = hasMove(member, QStringLiteral("trickroom"));
    roles.redirection = hasMove(member, QStringLiteral("followme")) || hasMove(member, QStringLiteral("ragepowder"));
    roles.weather = weatherAbilities.contains(abilityId) || hasAnyMove(member, weatherMoves);
    roles.terrain = terrainAbilities.contains(abilityId) || hasAnyMove(member, terrainMoves);
    roles.speedcontrol = hasAnyMove(member, speedMoves);
    roles.setupcarry = hasAnyMove(member, setupMoves) || ((member.calculatedStats.atk >= 140 || member.calculatedStats.spa >= 140) && attackMoves >= 2);
    roles.slowbreaker = member.calculatedStats.spe <= 110 && roles.setupcarry;
    return roles;
}

void pushUnique(QList<SynergyFinding>& findings, const QString& id, const QString& label, double bonus, const QStringList& members)
{
    for (const auto& finding : findings) {
        if (finding.id == id && finding.memberIds == members) return;
    }
    findings.append({id, label, bonus, members});
}

QStringList topLines(QHash<QString, int> counts, const DataRepository& data, int limit, const QString& suffix)
{
    QList<QPair<QString, int>> entries;
    for (auto it = counts.begin(); it != counts.end(); ++it) {
        if (it.value() > 0) entries.append({it.key(), it.value()});
    }
    std::sort(entries.begin(), entries.end(), [](const auto& left, const auto& right) {
        if (left.second != right.second) return left.second > right.second;
        return left.first < right.first;
    });
    QStringList result;
    const int count = std::min(limit, static_cast<int>(entries.size()));
    for (int i = 0; i < count; ++i) {
        result.append(QStringLiteral("%1 %2%3").arg(data.typeLabel(entries[i].first)).arg(entries[i].second).arg(suffix));
    }
    return result;
}

} // namespace

TeamAnalyzer::TeamAnalyzer(const DataRepository& data)
    : data_(data)
{
}

TeamSummary TeamAnalyzer::summarize(const Team& team) const
{
    TeamSummary summary;
    QList<Roles> roles;
    for (const auto& member : team.members) roles.append(rolesFor(member));

    for (int i = 0; i < team.members.size(); ++i) {
        for (int j = 0; j < team.members.size(); ++j) {
            if (i == j) continue;
            const auto& left = roles[i];
            const auto& right = roles[j];
            const QStringList ids = {team.members[i].speciesId, team.members[j].speciesId};
            if (left.fakeout && right.trickroom) pushUnique(summary.synergies, QStringLiteral("fakeoutTrickRoom"), QStringLiteral("击掌空间"), 2.8, ids);
            if (left.redirection && right.trickroom) pushUnique(summary.synergies, QStringLiteral("redirectionTrickRoom"), QStringLiteral("掩护空间"), 2.4, ids);
            if (left.redirection && right.setupcarry) pushUnique(summary.synergies, QStringLiteral("redirectionSetup"), QStringLiteral("掩护强化"), 2.3, ids);
            if (left.weather && hasWeatherPayoff(team.members[j])) pushUnique(summary.synergies, QStringLiteral("weatherMode"), QStringLiteral("天气收益"), 2.2, ids);
            if (left.terrain && hasTerrainPayoff(team.members[j])) pushUnique(summary.synergies, QStringLiteral("terrainMode"), QStringLiteral("场地收益"), 1.8, ids);
            if (left.speedcontrol && right.setupcarry) pushUnique(summary.synergies, QStringLiteral("speedBreaker"), QStringLiteral("速度控场"), 1.8, ids);
        }
    }

    for (int i = 0; i < team.members.size(); ++i) {
        for (int j = i + 1; j < team.members.size(); ++j) {
            for (int k = j + 1; k < team.members.size(); ++k) {
                const QList<int> indexes = {i, j, k};
                bool fakeout = false, trickroom = false, redirection = false, weather = false, speed = false, setup = false, weatherPayoff = false, slow = false;
                QStringList ids;
                for (const auto index : indexes) {
                    ids.append(team.members[index].speciesId);
                    fakeout = fakeout || roles[index].fakeout;
                    trickroom = trickroom || roles[index].trickroom;
                    redirection = redirection || roles[index].redirection;
                    weather = weather || roles[index].weather;
                    speed = speed || roles[index].speedcontrol;
                    setup = setup || roles[index].setupcarry;
                    slow = slow || roles[index].slowbreaker;
                    weatherPayoff = weatherPayoff || hasWeatherPayoff(team.members[index]);
                }
                if (fakeout && trickroom && (redirection || slow)) pushUnique(summary.synergies, QStringLiteral("trickRoomShell"), QStringLiteral("空间外壳"), 3.2, ids);
                if (weather && weatherPayoff && (speed || redirection)) pushUnique(summary.synergies, QStringLiteral("weatherShell"), QStringLiteral("天气外壳"), 2.8, ids);
                if (redirection && setup && (speed || fakeout)) pushUnique(summary.synergies, QStringLiteral("setupShell"), QStringLiteral("强化外壳"), 2.6, ids);
            }
        }
    }

    std::sort(summary.synergies.begin(), summary.synergies.end(), [](const auto& left, const auto& right) {
        if (left.bonus != right.bonus) return left.bonus > right.bonus;
        return left.label < right.label;
    });

    int weatherCount = 0, payoffCount = 0, speedCount = 0, carryCount = 0;
    bool hasWeatherShell = false, hasSetupShell = false;
    for (int i = 0; i < team.members.size(); ++i) {
        if (roles[i].weather) ++weatherCount;
        if (hasWeatherPayoff(team.members[i])) ++payoffCount;
        if (roles[i].speedcontrol) ++speedCount;
        if (roles[i].setupcarry) ++carryCount;
    }
    for (const auto& finding : summary.synergies) {
        hasWeatherShell = hasWeatherShell || finding.id == QStringLiteral("weatherShell");
        hasSetupShell = hasSetupShell || finding.id == QStringLiteral("setupShell");
    }
    if (hasWeatherShell || weatherCount + payoffCount >= 2) summary.primaryStyle = QStringLiteral("天气进攻");
    else if (speedCount >= 2 && carryCount >= 3) summary.primaryStyle = QStringLiteral("高速压制");
    else if (hasSetupShell) summary.primaryStyle = QStringLiteral("强化展开");
    else summary.primaryStyle = QStringLiteral("平衡队");
    for (const auto& finding : summary.synergies) {
        if (!summary.secondaryStyles.contains(finding.label) && summary.secondaryStyles.size() < 2) {
            summary.secondaryStyles.append(finding.label);
        }
    }

    QHash<QString, int> weakCounts;
    QHash<QString, int> coverageCounts;
    const QStringList types = {QStringLiteral("Normal"), QStringLiteral("Fighting"), QStringLiteral("Flying"), QStringLiteral("Poison"), QStringLiteral("Ground"), QStringLiteral("Rock"), QStringLiteral("Bug"), QStringLiteral("Ghost"), QStringLiteral("Steel"), QStringLiteral("Fire"), QStringLiteral("Water"), QStringLiteral("Grass"), QStringLiteral("Electric"), QStringLiteral("Psychic"), QStringLiteral("Ice"), QStringLiteral("Dragon"), QStringLiteral("Dark"), QStringLiteral("Fairy")};
    for (const auto& attack : types) {
        for (const auto& member : team.members) {
            double multiplier = 1.0;
            for (const auto& defend : member.types) multiplier *= data_.typeEffectiveness(attack, defend);
            if (multiplier >= 2.0) weakCounts[attack] += 1;
        }
        for (const auto& member : team.members) {
            for (const auto& move : member.moves) {
                if (move.category == QStringLiteral("Status") || move.type.isEmpty()) continue;
                if (data_.typeEffectiveness(move.type, attack) >= 2.0) coverageCounts[move.type] += 1;
            }
        }
    }
    summary.defensiveComboLines = topLines(weakCounts, data_, 3, QStringLiteral("只弱点"));
    summary.offensiveCoverageLines = topLines(coverageCounts, data_, 4, QStringLiteral("类打点"));
    if (summary.offensiveCoverageLines.isEmpty()) summary.offensiveCoverageLines.append(QStringLiteral("打点数据不足"));
    return summary;
}

} // namespace poketeam
