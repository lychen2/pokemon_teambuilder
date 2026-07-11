#pragma once

#include <QHash>
#include <QList>
#include <QString>
#include <QStringList>

namespace poketeam {

enum class Stat { Hp, Atk, Def, Spa, Spd, Spe };

struct StatSpread {
    int hp = 0;
    int atk = 0;
    int def = 0;
    int spa = 0;
    int spd = 0;
    int spe = 0;
};

struct Move {
    QString id;
    QString englishName;
    QString localizedName;
    QString type;
    QString category;
    int basePower = 0;
};

struct TeamMember {
    QString id;
    QString speciesId;
    QString englishName;
    QString localizedName;
    QString gender;
    QString item;
    QString localizedItem;
    int itemSpriteNumber = -1;
    QString ability;
    QString localizedAbility;
    QString nature;
    QString localizedNature;
    int level = 50;
    QStringList types;
    StatSpread points;
    StatSpread calculatedStats;
    QList<Move> moves;
    QString iconPath;
    QStringList warnings;
};

struct Team {
    QString slot = QStringLiteral("栏位4");
    QString teamId = QStringLiteral("78PR64HN5F");
    QString trainerName = QStringLiteral("橙子");
    QString avatarText = QStringLiteral("橙");
    QList<TeamMember> members;
};

struct SynergyFinding {
    QString id;
    QString label;
    double bonus = 0.0;
    QStringList memberIds;
};

struct TeamSummary {
    QString primaryStyle;
    QStringList secondaryStyles;
    QList<SynergyFinding> synergies;
    QStringList defensiveComboLines;
    QStringList offensiveCoverageLines;
    QStringList warnings;
};

struct PokemonRecord {
    QString id;
    QString englishName;
    QString localizedName;
    QStringList types;
    StatSpread baseStats;
    QHash<QString, QString> abilities;
    QString iconPath;
};

struct NamedRecord {
    QString id;
    QString englishName;
    QString localizedName;
    QString type;
    QString category;
    int basePower = 0;
    int spriteNumber = -1;
};

struct ParseResult {
    Team team;
    QStringList errors;
    QStringList warnings;
};

} // namespace poketeam
