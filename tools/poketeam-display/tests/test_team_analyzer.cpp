#include "poketeam/data_repository.hpp"
#include "poketeam/team_analyzer.hpp"
#include "poketeam/team_parser.hpp"

#include <QtTest/QtTest>

using namespace poketeam;

class TeamAnalyzerTest : public QObject {
    Q_OBJECT

private slots:
    void summarizesSynergy()
    {
        const auto data = DataRepository::loadFromAssets(QStringLiteral("assets"));
        QFile file(data.assetRoot() + QStringLiteral("/samples/chengziteam.txt"));
        QVERIFY(file.open(QIODevice::ReadOnly | QIODevice::Text));
        TeamParser parser(data);
        const auto result = parser.parseShowdownText(QString::fromUtf8(file.readAll()));
        TeamAnalyzer analyzer(data);
        const auto summary = analyzer.summarize(result.team);
        QStringList labels;
        for (const auto& finding : summary.synergies) labels.append(finding.label);
        QVERIFY(labels.contains(QStringLiteral("天气收益")) || labels.contains(QStringLiteral("天气外壳")));
        QVERIFY(labels.contains(QStringLiteral("场地收益")) || labels.contains(QStringLiteral("速度控场")));
        QVERIFY(!summary.primaryStyle.isEmpty());
    }
};

QTEST_MAIN(TeamAnalyzerTest)
#include "test_team_analyzer.moc"
