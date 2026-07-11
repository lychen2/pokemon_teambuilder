#include "poketeam/data_repository.hpp"
#include <QFile>
#include <QImage>

#include <QtTest/QtTest>

using namespace poketeam;

class DataRepositoryTest : public QObject {
    Q_OBJECT

private slots:
    void translatesKeyNames()
    {
        const auto data = DataRepository::loadFromAssets(QStringLiteral("assets"));
        QCOMPARE(data.translate(QStringLiteral("Jolteon")), QStringLiteral("雷伊布"));
        QCOMPARE(data.translate(QStringLiteral("Venusaur-Mega")), QStringLiteral("妙蛙花-超级进化"));
        QCOMPARE(data.translate(QStringLiteral("Ceruledge")), QStringLiteral("苍炎刃鬼"));
        QCOMPARE(data.translate(QStringLiteral("Raichu-Mega-X")), QStringLiteral("雷丘-超级进化-X"));
        QCOMPARE(data.translate(QStringLiteral("Ninetales-Alola")), QStringLiteral("九尾-阿罗拉"));
        QCOMPARE(data.translate(QStringLiteral("Grimmsnarl")), QStringLiteral("长毛巨魔"));
        QCOMPARE(data.translate(QStringLiteral("Life Orb")), QStringLiteral("生命宝珠"));
        QCOMPARE(data.translate(QStringLiteral("Focus Sash")), QStringLiteral("气势披带"));
        QCOMPARE(data.translate(QStringLiteral("Leftovers")), QStringLiteral("吃剩的东西"));
        QCOMPARE(data.translate(QStringLiteral("Rising Voltage")), QStringLiteral("电力上升"));
        QCOMPARE(data.translate(QStringLiteral("Weather Ball")), QStringLiteral("气象球"));
        QCOMPARE(data.translate(QStringLiteral("Electroweb")), QStringLiteral("电网"));
        QCOMPARE(data.translate(QStringLiteral("Spirit Break")), QStringLiteral("灵魂冲击"));
    }

    void normalizesNames()
    {
        const auto data = DataRepository::loadFromAssets(QStringLiteral("assets"));
        QCOMPARE(data.normalizeName(QStringLiteral("Raichu-Mega-X")), QStringLiteral("raichumegax"));
        QCOMPARE(data.normalizeLookupText(QStringLiteral("雷丘-超级进化-X")), QStringLiteral("雷丘超级进化x"));
    }

    void pokemonIconPathsResolveToBundledImages()
    {
        const auto data = DataRepository::loadFromAssets(QStringLiteral("assets"));
        const QStringList names = {QStringLiteral("Jolteon"), QStringLiteral("Bulbasaur"), QStringLiteral("Ceruledge")};
        for (const auto& name : names) {
            const auto record = data.pokemonByName(name);
            QVERIFY(record.has_value());
            QVERIFY2(!record->iconPath.isEmpty(), qPrintable(name));
            QVERIFY2(QFile::exists(record->iconPath), qPrintable(record->iconPath));
            const QImage image(record->iconPath);
            QVERIFY2(!image.isNull(), qPrintable(record->iconPath));
        }
    }
};

QTEST_MAIN(DataRepositoryTest)
#include "test_data_repository.moc"
