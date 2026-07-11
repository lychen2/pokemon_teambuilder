#pragma once

#include "poketeam/team_model.hpp"

#include <optional>

#include <QString>
#include <QStringView>

namespace poketeam {

class DataRepository {
public:
    static DataRepository loadFromAssets(const QString& assetRoot);

    QString assetRoot() const;
    QString normalizeName(QStringView text) const;
    QString normalizeLookupText(QStringView text) const;
    std::optional<PokemonRecord> pokemonByName(QStringView name) const;
    std::optional<NamedRecord> moveByName(QStringView name) const;
    std::optional<NamedRecord> itemByName(QStringView name) const;
    std::optional<NamedRecord> abilityByName(QStringView name) const;
    QString translate(QStringView english) const;
    QString typeLabel(QStringView englishType) const;
    QString pokemonIconPath(QStringView speciesId) const;
    double typeEffectiveness(QStringView attackType, QStringView defendType) const;
    QString localizedNature(QStringView nature) const;
    Stat natureBoost(QStringView nature) const;
    Stat natureDrop(QStringView nature) const;

private:
    QString assetRoot_;
    QHash<QString, PokemonRecord> pokemonById_;
    QHash<QString, QString> speciesIndex_;
    QHash<QString, NamedRecord> moveLookup_;
    QHash<QString, NamedRecord> itemLookup_;
    QHash<QString, NamedRecord> abilityLookup_;
    QHash<QString, QString> translations_;
    QHash<QString, QString> typeLabels_;
    QHash<QString, QString> natureLabels_;
    QHash<QString, QPair<Stat, Stat>> natureEffects_;
    QHash<QString, QHash<QString, double>> typeChart_;
    QHash<QString, QString> iconFiles_;
};

} // namespace poketeam
