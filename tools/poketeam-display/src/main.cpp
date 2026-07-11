#include "poketeam/data_repository.hpp"
#include "poketeam/main_window.hpp"
#include "poketeam/share_controller.hpp"
#include "poketeam/team_analyzer.hpp"
#include "poketeam/team_parser.hpp"
#include "poketeam/team_renderer.hpp"

#include <QApplication>
#include <QCommandLineParser>
#include <QCoreApplication>
#include <QDir>
#include <QFile>
#include <QTextStream>

using namespace poketeam;

namespace {

QString readInput(const QString& path)
{
    QFile file(path);
    if (!file.open(QIODevice::ReadOnly | QIODevice::Text)) return {};
    return QString::fromUtf8(file.readAll());
}

enum class CliRenderPage { Abilities, Stats, Share };

CliRenderPage parsePage(const QString& value, bool* ok)
{
    const auto normalized = value.trimmed().toLower();
    if (normalized == QStringLiteral("abilities")) {
        *ok = true;
        return CliRenderPage::Abilities;
    }
    if (normalized == QStringLiteral("stats")) {
        *ok = true;
        return CliRenderPage::Stats;
    }
    if (normalized == QStringLiteral("share")) {
        *ok = true;
        return CliRenderPage::Share;
    }
    *ok = false;
    return CliRenderPage::Abilities;
}

QString assetRoot()
{
    const auto appDir = QCoreApplication::applicationDirPath();
    const QStringList candidates = {
        QDir(appDir).filePath(QStringLiteral("../assets")),
        QDir(appDir).filePath(QStringLiteral("assets")),
        QDir::current().filePath(QStringLiteral("assets")),
    };
    for (const auto& candidate : candidates) {
        if (QFile::exists(QDir(candidate).filePath(QStringLiteral("data/localization-data.json")))) {
            return candidate;
        }
    }
    return QStringLiteral("assets");
}

int printError(const QString& message, int code)
{
    QTextStream(stderr) << message << '\n';
    return code;
}

} // namespace

int main(int argc, char* argv[])
{
    QApplication app(argc, argv);
    QCommandLineParser parser;
    parser.setApplicationDescription(QStringLiteral("宝可梦队伍可视化展示与分享"));
    parser.addHelpOption();
    const QCommandLineOption inputOption({QStringLiteral("i"), QStringLiteral("input")}, QStringLiteral("Showdown team text path"), QStringLiteral("team.txt"));
    const QCommandLineOption pageOption(QStringLiteral("page"), QStringLiteral("Render page: abilities, stats, or share"), QStringLiteral("page"));
    const QCommandLineOption outputOption({QStringLiteral("o"), QStringLiteral("output")}, QStringLiteral("Output PNG path"), QStringLiteral("file.png"));
    const QCommandLineOption slotOption(QStringLiteral("slot"), QStringLiteral("Header slot label"), QStringLiteral("slot"));
    const QCommandLineOption teamIdOption(QStringLiteral("team-id"), QStringLiteral("Header team code"), QStringLiteral("team-id"));
    const QCommandLineOption trainerOption(QStringLiteral("trainer"), QStringLiteral("Header trainer name"), QStringLiteral("trainer"));
    const QCommandLineOption avatarOption(QStringLiteral("avatar"), QStringLiteral("Header avatar text"), QStringLiteral("avatar"));
    parser.addOption(inputOption);
    parser.addOption(pageOption);
    parser.addOption(outputOption);
    parser.addOption(slotOption);
    parser.addOption(teamIdOption);
    parser.addOption(trainerOption);
    parser.addOption(avatarOption);
    parser.process(app);

    const bool cliMode = parser.isSet(inputOption) || parser.isSet(outputOption) || parser.isSet(pageOption) || parser.isSet(slotOption) || parser.isSet(teamIdOption) || parser.isSet(trainerOption) || parser.isSet(avatarOption);
    if (!cliMode) {
        MainWindow window;
        window.show();
        return app.exec();
    }

    if (!parser.isSet(inputOption) || !parser.isSet(outputOption) || !parser.isSet(pageOption)) {
        return printError(QStringLiteral("CLI 模式必须同时提供 --input、--page 和 --output"), 1);
    }
    bool pageOk = false;
    const auto page = parsePage(parser.value(pageOption), &pageOk);
    if (!pageOk) return printError(QStringLiteral("--page 只接受 abilities、stats 或 share"), 1);

    const auto text = readInput(parser.value(inputOption));
    if (text.isEmpty()) return printError(QStringLiteral("输入文件不存在或为空：%1").arg(parser.value(inputOption)), 2);

    try {
        const auto data = DataRepository::loadFromAssets(assetRoot());
        const TeamParser teamParser(data);
        auto parsed = teamParser.parseShowdownText(text);
        if (parsed.team.members.isEmpty()) return printError(QStringLiteral("解析不到任何队伍成员"), 3);
        if (parser.isSet(slotOption)) parsed.team.slot = parser.value(slotOption).trimmed();
        if (parser.isSet(teamIdOption)) parsed.team.teamId = parser.value(teamIdOption).trimmed();
        if (parser.isSet(trainerOption)) parsed.team.trainerName = parser.value(trainerOption).trimmed();
        if (parser.isSet(avatarOption)) parsed.team.avatarText = parser.value(avatarOption).trimmed();
        if (parsed.team.avatarText.isEmpty()) parsed.team.avatarText = parsed.team.trainerName.left(1);
        const TeamAnalyzer analyzer(data);
        const auto summary = analyzer.summarize(parsed.team);
        const TeamRenderer renderer(data);
        const auto image = page == CliRenderPage::Share
            ? renderer.renderShareImage(parsed.team, summary)
            : renderer.render(parsed.team, summary, page == CliRenderPage::Abilities ? RenderPage::Abilities : RenderPage::Stats);
        QString error;
        if (!ShareController().savePng(image, parser.value(outputOption), &error)) return printError(error, 4);
    } catch (const std::exception& error) {
        return printError(QString::fromUtf8(error.what()), 1);
    }
    return 0;
}
