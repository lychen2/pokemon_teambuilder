#include "poketeam/data_repository.hpp"
#include "poketeam/team_parser.hpp"
#include <QFile>

#include <QtTest/QtTest>

using namespace poketeam;

class TeamParserTest : public QObject {
    Q_OBJECT

private slots:
    void parsesChengziTeam()
    {
        const auto data = DataRepository::loadFromAssets(QStringLiteral("assets"));
        QFile file(data.assetRoot() + QStringLiteral("/samples/chengziteam.txt"));
        QVERIFY(file.open(QIODevice::ReadOnly | QIODevice::Text));
        TeamParser parser(data);
        const auto result = parser.parseShowdownText(QString::fromUtf8(file.readAll()));
        QCOMPARE(result.errors.size(), 0);
        QCOMPARE(result.team.members.size(), 6);
        QCOMPARE(result.team.members[0].speciesId, QStringLiteral("jolteon"));
        QCOMPARE(result.team.members[0].item, QStringLiteral("Life Orb"));
        QCOMPARE(result.team.members[0].ability, QStringLiteral("Volt Absorb"));
        QVERIFY(std::any_of(result.team.members[0].moves.begin(), result.team.members[0].moves.end(), [](const Move& move) { return move.englishName == QStringLiteral("Rising Voltage"); }));
        QCOMPARE(result.team.members[3].speciesId, QStringLiteral("raichumegax"));
        QVERIFY(std::any_of(result.team.members[5].moves.begin(), result.team.members[5].moves.end(), [](const Move& move) { return move.englishName == QStringLiteral("Spirit Break"); }));
        QVERIFY(!result.team.members[0].iconPath.isEmpty());
        QVERIFY(QFile::exists(result.team.members[0].iconPath));
    }
};

QTEST_MAIN(TeamParserTest)
#include "test_team_parser.moc"
