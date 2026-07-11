#include "poketeam/data_repository.hpp"
#include "poketeam/team_analyzer.hpp"
#include "poketeam/team_parser.hpp"
#include "poketeam/team_renderer.hpp"

#include <QtTest/QtTest>

using namespace poketeam;

class TeamRendererTest : public QObject {
    Q_OBJECT

private slots:
    void rendersBothPages()
    {
        const auto data = DataRepository::loadFromAssets(QStringLiteral("assets"));
        QFile file(data.assetRoot() + QStringLiteral("/samples/chengziteam.txt"));
        QVERIFY(file.open(QIODevice::ReadOnly | QIODevice::Text));
        TeamParser parser(data);
        auto result = parser.parseShowdownText(QString::fromUtf8(file.readAll()));
        result.team.slot = QStringLiteral("栏位9");
        result.team.teamId = QStringLiteral("RAIN2026");
        result.team.trainerName = QStringLiteral("雨队");
        result.team.avatarText = QStringLiteral("雨");
        TeamAnalyzer analyzer(data);
        const auto summary = analyzer.summarize(result.team);
        TeamRenderer renderer(data);
        const auto abilities = renderer.render(result.team, summary, RenderPage::Abilities);
        const auto stats = renderer.render(result.team, summary, RenderPage::Stats);
        QCOMPARE(abilities.size(), QSize(2622, 1206));
        QCOMPARE(stats.size(), QSize(2622, 1206));
        const auto share = renderer.renderShareImage(result.team, summary);
        QCOMPARE(share.size(), QSize(5244, 4824));
        QVERIFY(share.save(QStringLiteral("/tmp/poketeam-share-render-test.png")));
        QVERIFY(abilities.pixelColor(460, 275) != abilities.pixelColor(40, 40));
        QVERIFY(abilities.pixelColor(1360, 510) != abilities.pixelColor(40, 40));
        QVERIFY(stats.pixelColor(460, 740) != stats.pixelColor(40, 40));
        QVERIFY(share.pixelColor(920, 550) != share.pixelColor(80, 80));
        QVERIFY(share.pixelColor(920, 3892) != share.pixelColor(80, 80));
    }
};

QTEST_MAIN(TeamRendererTest)
#include "test_team_renderer.moc"
