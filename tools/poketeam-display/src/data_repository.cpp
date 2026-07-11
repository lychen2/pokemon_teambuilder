#include "poketeam/data_repository.hpp"

#include <QDir>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonValue>
#include <QRegularExpression>

#include <cmath>
#include <stdexcept>

namespace poketeam {
namespace {

QByteArray json5ToJson(QByteArray text)
{
    static const QRegularExpression keyPattern(QStringLiteral(R"(([\{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)(\s*:))"));
    QString value = QString::fromUtf8(text);
    value.replace(keyPattern, QStringLiteral(R"(\1"\2"\3)"));
    return value.toUtf8();
}

QJsonObject readJsonObject(const QString& path)
{
    QFile file(path);
    if (!file.open(QIODevice::ReadOnly)) {
        throw std::runtime_error(QStringLiteral("Failed to read %1").arg(path).toStdString());
    }
    auto document = QJsonDocument::fromJson(file.readAll());
    if (!document.isObject()) {
        file.seek(0);
        document = QJsonDocument::fromJson(json5ToJson(file.readAll()));
    }
    if (!document.isObject()) {
        throw std::runtime_error(QStringLiteral("Expected JSON object: %1").arg(path).toStdString());
    }
    return document.object();
}

int jsonInt(const QJsonObject& object, const QString& key)
{
    return object.value(key).toInt();
}

QString jsonString(const QJsonObject& object, const QString& key)
{
    return object.value(key).toString();
}

QString stripAccent(QString value)
{
    return value.replace(QStringLiteral("é"), QStringLiteral("e"));
}

QString resolveAssetRoot(QString assetRoot)
{
    QDir root(assetRoot);
    if (QFile::exists(root.filePath(QStringLiteral("data/localization-data.json")))) return root.path();
    root = QDir(QDir::current().filePath(assetRoot));
    if (QFile::exists(root.filePath(QStringLiteral("data/localization-data.json")))) return root.path();
    root = QDir(QDir::current().filePath(QStringLiteral("../") + assetRoot));
    if (QFile::exists(root.filePath(QStringLiteral("data/localization-data.json")))) return root.path();
    return assetRoot;
}

void putType(QHash<QString, QHash<QString, double>>& chart, const QString& attack, std::initializer_list<std::pair<const char*, double>> entries)
{
    QHash<QString, double> row;
    for (const auto& [type, value] : entries) {
        row.insert(QString::fromLatin1(type), value);
    }
    chart.insert(attack, row);
}

QPair<Stat, Stat> effect(Stat plus, Stat minus)
{
    return {plus, minus};
}

} // namespace

DataRepository DataRepository::loadFromAssets(const QString& assetRoot)
{
    DataRepository data;
    data.assetRoot_ = assetRoot;
    data.typeLabels_ = {
        {QStringLiteral("Normal"), QStringLiteral("一般")},
        {QStringLiteral("Fighting"), QStringLiteral("格斗")},
        {QStringLiteral("Flying"), QStringLiteral("飞行")},
        {QStringLiteral("Poison"), QStringLiteral("毒")},
        {QStringLiteral("Ground"), QStringLiteral("地面")},
        {QStringLiteral("Rock"), QStringLiteral("岩石")},
        {QStringLiteral("Bug"), QStringLiteral("虫")},
        {QStringLiteral("Ghost"), QStringLiteral("幽灵")},
        {QStringLiteral("Steel"), QStringLiteral("钢")},
        {QStringLiteral("Fire"), QStringLiteral("火")},
        {QStringLiteral("Water"), QStringLiteral("水")},
        {QStringLiteral("Grass"), QStringLiteral("草")},
        {QStringLiteral("Electric"), QStringLiteral("电")},
        {QStringLiteral("Psychic"), QStringLiteral("超能")},
        {QStringLiteral("Ice"), QStringLiteral("冰")},
        {QStringLiteral("Dragon"), QStringLiteral("龙")},
        {QStringLiteral("Dark"), QStringLiteral("恶")},
        {QStringLiteral("Fairy"), QStringLiteral("妖精")},
    };
    data.natureLabels_ = {
        {QStringLiteral("Adamant"), QStringLiteral("固执")}, {QStringLiteral("Bashful"), QStringLiteral("害羞")},
        {QStringLiteral("Bold"), QStringLiteral("大胆")}, {QStringLiteral("Brave"), QStringLiteral("勇敢")},
        {QStringLiteral("Calm"), QStringLiteral("温和")}, {QStringLiteral("Careful"), QStringLiteral("慎重")},
        {QStringLiteral("Docile"), QStringLiteral("坦率")}, {QStringLiteral("Gentle"), QStringLiteral("温顺")},
        {QStringLiteral("Hardy"), QStringLiteral("勤奋")}, {QStringLiteral("Hasty"), QStringLiteral("急躁")},
        {QStringLiteral("Impish"), QStringLiteral("淘气")}, {QStringLiteral("Jolly"), QStringLiteral("爽朗")},
        {QStringLiteral("Lax"), QStringLiteral("乐天")}, {QStringLiteral("Lonely"), QStringLiteral("怕寂寞")},
        {QStringLiteral("Mild"), QStringLiteral("慢吞吞")}, {QStringLiteral("Modest"), QStringLiteral("内敛")},
        {QStringLiteral("Naive"), QStringLiteral("天真")}, {QStringLiteral("Naughty"), QStringLiteral("顽皮")},
        {QStringLiteral("Quiet"), QStringLiteral("冷静")}, {QStringLiteral("Quirky"), QStringLiteral("浮躁")},
        {QStringLiteral("Rash"), QStringLiteral("马虎")}, {QStringLiteral("Relaxed"), QStringLiteral("悠闲")},
        {QStringLiteral("Sassy"), QStringLiteral("自大")}, {QStringLiteral("Serious"), QStringLiteral("认真")},
        {QStringLiteral("Timid"), QStringLiteral("胆小")},
    };
    data.natureEffects_ = {
        {QStringLiteral("Adamant"), effect(Stat::Atk, Stat::Spa)}, {QStringLiteral("Bold"), effect(Stat::Def, Stat::Atk)},
        {QStringLiteral("Brave"), effect(Stat::Atk, Stat::Spe)}, {QStringLiteral("Calm"), effect(Stat::Spd, Stat::Atk)},
        {QStringLiteral("Careful"), effect(Stat::Spd, Stat::Spa)}, {QStringLiteral("Gentle"), effect(Stat::Spd, Stat::Def)},
        {QStringLiteral("Hasty"), effect(Stat::Spe, Stat::Def)}, {QStringLiteral("Impish"), effect(Stat::Def, Stat::Spa)},
        {QStringLiteral("Jolly"), effect(Stat::Spe, Stat::Spa)}, {QStringLiteral("Lax"), effect(Stat::Def, Stat::Spd)},
        {QStringLiteral("Lonely"), effect(Stat::Atk, Stat::Def)}, {QStringLiteral("Mild"), effect(Stat::Spa, Stat::Def)},
        {QStringLiteral("Modest"), effect(Stat::Spa, Stat::Atk)}, {QStringLiteral("Naive"), effect(Stat::Spe, Stat::Spd)},
        {QStringLiteral("Naughty"), effect(Stat::Atk, Stat::Spd)}, {QStringLiteral("Quiet"), effect(Stat::Spa, Stat::Spe)},
        {QStringLiteral("Rash"), effect(Stat::Spa, Stat::Spd)}, {QStringLiteral("Relaxed"), effect(Stat::Def, Stat::Spe)},
        {QStringLiteral("Sassy"), effect(Stat::Spd, Stat::Spe)}, {QStringLiteral("Timid"), effect(Stat::Spe, Stat::Atk)},
    };

    putType(data.typeChart_, QStringLiteral("Normal"), {{"Rock", 0.5}, {"Ghost", 0}, {"Steel", 0.5}});
    putType(data.typeChart_, QStringLiteral("Fighting"), {{"Normal", 2}, {"Flying", 0.5}, {"Poison", 0.5}, {"Rock", 2}, {"Bug", 0.5}, {"Ghost", 0}, {"Steel", 2}, {"Psychic", 0.5}, {"Ice", 2}, {"Dark", 2}, {"Fairy", 0.5}});
    putType(data.typeChart_, QStringLiteral("Flying"), {{"Fighting", 2}, {"Rock", 0.5}, {"Bug", 2}, {"Steel", 0.5}, {"Grass", 2}, {"Electric", 0.5}});
    putType(data.typeChart_, QStringLiteral("Poison"), {{"Poison", 0.5}, {"Ground", 0.5}, {"Rock", 0.5}, {"Ghost", 0.5}, {"Steel", 0}, {"Grass", 2}, {"Fairy", 2}});
    putType(data.typeChart_, QStringLiteral("Ground"), {{"Flying", 0}, {"Poison", 2}, {"Rock", 2}, {"Bug", 0.5}, {"Steel", 2}, {"Fire", 2}, {"Grass", 0.5}, {"Electric", 2}});
    putType(data.typeChart_, QStringLiteral("Rock"), {{"Fighting", 0.5}, {"Flying", 2}, {"Ground", 0.5}, {"Bug", 2}, {"Steel", 0.5}, {"Fire", 2}, {"Ice", 2}});
    putType(data.typeChart_, QStringLiteral("Bug"), {{"Fighting", 0.5}, {"Flying", 0.5}, {"Poison", 0.5}, {"Ghost", 0.5}, {"Steel", 0.5}, {"Fire", 0.5}, {"Grass", 2}, {"Psychic", 2}, {"Dark", 2}, {"Fairy", 0.5}});
    putType(data.typeChart_, QStringLiteral("Ghost"), {{"Normal", 0}, {"Psychic", 2}, {"Ghost", 2}, {"Dark", 0.5}});
    putType(data.typeChart_, QStringLiteral("Steel"), {{"Rock", 2}, {"Steel", 0.5}, {"Fire", 0.5}, {"Water", 0.5}, {"Electric", 0.5}, {"Ice", 2}, {"Fairy", 2}});
    putType(data.typeChart_, QStringLiteral("Fire"), {{"Rock", 0.5}, {"Bug", 2}, {"Steel", 2}, {"Fire", 0.5}, {"Water", 0.5}, {"Grass", 2}, {"Ice", 2}, {"Dragon", 0.5}});
    putType(data.typeChart_, QStringLiteral("Water"), {{"Ground", 2}, {"Rock", 2}, {"Fire", 2}, {"Water", 0.5}, {"Grass", 0.5}, {"Dragon", 0.5}});
    putType(data.typeChart_, QStringLiteral("Grass"), {{"Flying", 0.5}, {"Poison", 0.5}, {"Ground", 2}, {"Rock", 2}, {"Bug", 0.5}, {"Steel", 0.5}, {"Fire", 0.5}, {"Water", 2}, {"Grass", 0.5}, {"Dragon", 0.5}});
    putType(data.typeChart_, QStringLiteral("Electric"), {{"Flying", 2}, {"Ground", 0}, {"Water", 2}, {"Grass", 0.5}, {"Electric", 0.5}, {"Dragon", 0.5}});
    putType(data.typeChart_, QStringLiteral("Psychic"), {{"Fighting", 2}, {"Poison", 2}, {"Steel", 0.5}, {"Psychic", 0.5}, {"Dark", 0}});
    putType(data.typeChart_, QStringLiteral("Ice"), {{"Flying", 2}, {"Ground", 2}, {"Steel", 0.5}, {"Fire", 0.5}, {"Water", 0.5}, {"Grass", 2}, {"Ice", 0.5}, {"Dragon", 2}});
    putType(data.typeChart_, QStringLiteral("Dragon"), {{"Steel", 0.5}, {"Dragon", 2}, {"Fairy", 0}});
    putType(data.typeChart_, QStringLiteral("Dark"), {{"Fighting", 0.5}, {"Ghost", 2}, {"Psychic", 2}, {"Dark", 0.5}, {"Fairy", 0.5}});
    putType(data.typeChart_, QStringLiteral("Fairy"), {{"Poison", 0.5}, {"Steel", 0.5}, {"Fire", 0.5}, {"Fighting", 2}, {"Dragon", 2}, {"Dark", 2}});

    data.assetRoot_ = resolveAssetRoot(assetRoot);
    const QDir root(data.assetRoot_);
    const auto localization = readJsonObject(root.filePath(QStringLiteral("data/localization-data.json"))).value(QStringLiteral("translations")).toObject();
    for (auto it = localization.begin(); it != localization.end(); ++it) {
        data.translations_.insert(stripAccent(it.key()), it.value().toString());
    }

    const auto assets = readJsonObject(root.filePath(QStringLiteral("data/team-planner-assets.json"))).value(QStringLiteral("pokemon")).toObject();
    for (auto it = assets.begin(); it != assets.end(); ++it) {
        data.iconFiles_.insert(it.key(), it.value().toObject().value(QStringLiteral("file")).toString());
    }

    const auto pokedex = readJsonObject(root.filePath(QStringLiteral("data/pokedex.json")));
    for (auto it = pokedex.begin(); it != pokedex.end(); ++it) {
        const auto object = it.value().toObject();
        const auto stats = object.value(QStringLiteral("baseStats")).toObject();
        PokemonRecord record;
        record.id = it.key();
        record.englishName = jsonString(object, QStringLiteral("name"));
        record.localizedName = data.translate(record.englishName);
        for (const auto typeValue : object.value(QStringLiteral("types")).toArray()) {
            record.types.append(typeValue.toString());
        }
        record.baseStats = {jsonInt(stats, QStringLiteral("hp")), jsonInt(stats, QStringLiteral("atk")), jsonInt(stats, QStringLiteral("def")), jsonInt(stats, QStringLiteral("spa")), jsonInt(stats, QStringLiteral("spd")), jsonInt(stats, QStringLiteral("spe"))};
        const auto abilities = object.value(QStringLiteral("abilities")).toObject();
        for (auto ability = abilities.begin(); ability != abilities.end(); ++ability) {
            record.abilities.insert(ability.key(), ability.value().toString());
        }
        record.iconPath = data.pokemonIconPath(record.id);
        data.pokemonById_.insert(record.id, record);
        const QStringList aliases = {record.id, record.englishName, record.englishName.remove('-'), record.englishName.simplified().remove(' '), record.localizedName, QString(record.localizedName).remove('-'), QString(record.localizedName).remove(' ')};
        for (const auto& alias : aliases) {
            const auto normalized = data.normalizeName(alias);
            const auto lookup = data.normalizeLookupText(alias);
            if (!normalized.isEmpty()) data.speciesIndex_.insert(normalized, record.id);
            if (!lookup.isEmpty()) data.speciesIndex_.insert(lookup, record.id);
        }
    }

    const auto loadNamed = [&](const QString& fileName, QHash<QString, NamedRecord>& target) {
        const auto object = readJsonObject(root.filePath(QStringLiteral("data/") + fileName));
        for (auto it = object.begin(); it != object.end(); ++it) {
            const auto item = it.value().toObject();
            NamedRecord record;
            record.id = data.normalizeName(jsonString(item, QStringLiteral("id")).isEmpty() ? it.key() : jsonString(item, QStringLiteral("id")));
            record.englishName = jsonString(item, QStringLiteral("name"));
            if (record.englishName.isEmpty()) record.englishName = it.key();
            record.localizedName = data.translate(record.englishName);
            record.type = jsonString(item, QStringLiteral("type"));
            record.category = jsonString(item, QStringLiteral("category"));
            record.basePower = jsonInt(item, QStringLiteral("basePower"));
            record.spriteNumber = item.value(QStringLiteral("spritenum")).toInt(-1);
            target.insert(data.normalizeName(it.key()), record);
            target.insert(data.normalizeName(record.englishName), record);
            target.insert(data.normalizeLookupText(record.localizedName), record);
        }
    };
    loadNamed(QStringLiteral("moves.json"), data.moveLookup_);
    loadNamed(QStringLiteral("items.json"), data.itemLookup_);
    loadNamed(QStringLiteral("abilities.json"), data.abilityLookup_);
    if (data.moveLookup_.contains(QStringLiteral("disable"))) {
        auto disable = data.moveLookup_.value(QStringLiteral("disable"));
        disable.localizedName = QStringLiteral("定身法");
        data.moveLookup_.insert(QStringLiteral("disable"), disable);
    }
    return data;
}

QString DataRepository::assetRoot() const
{
    return assetRoot_;
}

QString DataRepository::normalizeName(QStringView text) const
{
    QString result;
    const auto input = text.toString().toLower();
    for (const auto ch : input) {
        if ((ch >= u'a' && ch <= u'z') || (ch >= u'0' && ch <= u'9')) {
            result.append(ch);
        }
    }
    return result;
}

QString DataRepository::normalizeLookupText(QStringView text) const
{
    QString result;
    const auto input = text.toString().toLower();
    for (const auto ch : input) {
        if ((ch >= u'a' && ch <= u'z') || (ch >= u'0' && ch <= u'9') || (ch.unicode() >= 0x4e00 && ch.unicode() <= 0x9fff)) {
            result.append(ch);
        }
    }
    return result;
}

std::optional<PokemonRecord> DataRepository::pokemonByName(QStringView name) const
{
    const auto id = speciesIndex_.value(normalizeName(name), speciesIndex_.value(normalizeLookupText(name)));
    if (id.isEmpty() || !pokemonById_.contains(id)) return std::nullopt;
    return pokemonById_.value(id);
}

std::optional<NamedRecord> DataRepository::moveByName(QStringView name) const
{
    const auto key = normalizeName(name);
    if (moveLookup_.contains(key)) return moveLookup_.value(key);
    const auto lookup = normalizeLookupText(name);
    if (moveLookup_.contains(lookup)) return moveLookup_.value(lookup);
    return std::nullopt;
}

std::optional<NamedRecord> DataRepository::itemByName(QStringView name) const
{
    const auto key = normalizeName(name);
    if (itemLookup_.contains(key)) return itemLookup_.value(key);
    const auto lookup = normalizeLookupText(name);
    if (itemLookup_.contains(lookup)) return itemLookup_.value(lookup);
    return std::nullopt;
}

std::optional<NamedRecord> DataRepository::abilityByName(QStringView name) const
{
    const auto key = normalizeName(name);
    if (abilityLookup_.contains(key)) return abilityLookup_.value(key);
    const auto lookup = normalizeLookupText(name);
    if (abilityLookup_.contains(lookup)) return abilityLookup_.value(lookup);
    return std::nullopt;
}

QString DataRepository::translate(QStringView english) const
{
    const auto key = stripAccent(english.toString());
    return translations_.value(key, english.toString());
}

QString DataRepository::typeLabel(QStringView englishType) const
{
    return typeLabels_.value(englishType.toString(), englishType.toString());
}

QString DataRepository::pokemonIconPath(QStringView speciesId) const
{
    const auto key = normalizeName(speciesId);
    const auto file = iconFiles_.value(key);
    if (file.isEmpty()) return {};
    return QDir(assetRoot_).filePath(QStringLiteral("pokemon/") + file);
}

double DataRepository::typeEffectiveness(QStringView attackType, QStringView defendType) const
{
    const auto row = typeChart_.value(attackType.toString());
    return row.value(defendType.toString(), 1.0);
}

QString DataRepository::localizedNature(QStringView nature) const
{
    return natureLabels_.value(nature.toString(), nature.toString());
}

Stat DataRepository::natureBoost(QStringView nature) const
{
    return natureEffects_.value(nature.toString(), {Stat::Hp, Stat::Hp}).first;
}

Stat DataRepository::natureDrop(QStringView nature) const
{
    return natureEffects_.value(nature.toString(), {Stat::Hp, Stat::Hp}).second;
}

} // namespace poketeam
