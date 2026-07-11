#include "poketeam/main_window.hpp"

#include "poketeam/share_controller.hpp"

#include <QDateTime>
#include <QFile>
#include <QFileDialog>
#include <QFormLayout>
#include <QHBoxLayout>
#include <QMessageBox>
#include <QPushButton>
#include <QScrollArea>
#include <QSplitter>
#include <QStandardPaths>
#include <QVBoxLayout>

namespace poketeam {
namespace {

QString readTextFile(const QString& path)
{
    QFile file(path);
    if (!file.open(QIODevice::ReadOnly | QIODevice::Text)) return {};
    return QString::fromUtf8(file.readAll());
}

QString outputName()
{
    return QStringLiteral("poketeam-share.png");
}

} // namespace

MainWindow::MainWindow(QWidget* parent)
    : QMainWindow(parent)
    , data_(DataRepository::loadFromAssets(QStringLiteral("assets")))
    , parser_(data_)
    , analyzer_(data_)
    , renderer_(data_)
{
    auto* root = new QWidget(this);
    root->setObjectName(QStringLiteral("appRoot"));
    root->setStyleSheet(QStringLiteral(R"(
        QWidget#appRoot {
            background-image: url("assets/champions-ui/backgrounds/background.webp");
            background-position: center;
        }
        QWidget#controlPanel {
            background: qlineargradient(x1:0, y1:0, x2:1, y2:1, stop:0 #5854c1, stop:1 #8c82e4);
            border: 3px solid #c5bdf7;
            border-radius: 20px;
        }
        QLineEdit, QPlainTextEdit {
            color: #2f3d73;
            background: #b8c0ef;
            border: 0;
            border-radius: 6px;
            padding: 8px 12px;
            selection-background-color: #c2ec20;
        }
        QLabel {
            color: #ffffff;
        }
        QPushButton {
            color: #364a90;
            background: #f3eff8;
            border: 2px solid transparent;
            border-radius: 16px;
            min-height: 36px;
            padding: 6px 16px;
            font-weight: 600;
        }
        QPushButton:hover, QPushButton:checked {
            color: #364a90;
            background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #abe049, stop:1 #ecf461);
            border: 2px solid #ffffff;
        }
        QLabel#previewSurface {
            background: rgba(88, 84, 193, 0.28);
            border: 3px solid rgba(197, 189, 247, 0.72);
            border-radius: 18px;
        }
    )"));
    auto* layout = new QHBoxLayout(root);
    auto* left = new QWidget(root);
    left->setObjectName(QStringLiteral("controlPanel"));
    auto* leftLayout = new QVBoxLayout(left);
    leftLayout->setContentsMargins(18, 18, 18, 18);
    leftLayout->setSpacing(12);
    auto* metadataRow = new QWidget(left);
    auto* metadataLayout = new QFormLayout(metadataRow);
    slotEdit_ = new QLineEdit(QStringLiteral("栏位4"), metadataRow);
    teamIdEdit_ = new QLineEdit(QStringLiteral("78PR64HN5F"), metadataRow);
    trainerNameEdit_ = new QLineEdit(QStringLiteral("橙子"), metadataRow);
    avatarTextEdit_ = new QLineEdit(QStringLiteral("橙"), metadataRow);
    metadataLayout->addRow(QStringLiteral("栏位"), slotEdit_);
    metadataLayout->addRow(QStringLiteral("队伍码"), teamIdEdit_);
    metadataLayout->addRow(QStringLiteral("用户名"), trainerNameEdit_);
    metadataLayout->addRow(QStringLiteral("头像文字"), avatarTextEdit_);
    leftLayout->addWidget(metadataRow);

    editor_ = new QPlainTextEdit(left);
    editor_->setPlaceholderText(QStringLiteral("粘贴 Pokémon Showdown 队伍文本"));
    leftLayout->addWidget(editor_, 1);

    auto* buttonRow = new QWidget(left);
    auto* buttonLayout = new QHBoxLayout(buttonRow);
    auto* loadButton = new QPushButton(QStringLiteral("导入 chengziteam.txt"), buttonRow);
    abilitiesButton_ = new QPushButton(QStringLiteral("能力"), buttonRow);
    statsButton_ = new QPushButton(QStringLiteral("状态"), buttonRow);
    abilitiesButton_->setCheckable(true);
    statsButton_->setCheckable(true);
    abilitiesButton_->setChecked(true);
    buttonLayout->addWidget(loadButton);
    buttonLayout->addWidget(abilitiesButton_);
    buttonLayout->addWidget(statsButton_);
    leftLayout->addWidget(buttonRow);

    auto* shareRow = new QWidget(left);
    auto* shareLayout = new QHBoxLayout(shareRow);
    auto* exportButton = new QPushButton(QStringLiteral("保存分享图"), shareRow);
    auto* copyButton = new QPushButton(QStringLiteral("复制当前页"), shareRow);
    shareLayout->addWidget(exportButton);
    shareLayout->addWidget(copyButton);
    leftLayout->addWidget(shareRow);

    messages_ = new QLabel(left);
    messages_->setWordWrap(true);
    messages_->setMinimumHeight(88);
    leftLayout->addWidget(messages_);

    preview_ = new QLabel(root);
    preview_->setAlignment(Qt::AlignCenter);
    preview_->setMinimumSize(600, 276);
    preview_->setObjectName(QStringLiteral("previewSurface"));
    preview_->setMargin(12);
    preview_->setScaledContents(false);
    auto* scroll = new QScrollArea(root);
    scroll->setWidget(preview_);
    scroll->setWidgetResizable(true);

    auto* splitter = new QSplitter(root);
    splitter->addWidget(left);
    splitter->addWidget(scroll);
    splitter->setStretchFactor(0, 0);
    splitter->setStretchFactor(1, 1);
    layout->addWidget(splitter);
    setCentralWidget(root);
    setWindowTitle(QStringLiteral("宝可梦队伍展示与分享"));
    resize(1400, 760);

    connect(loadButton, &QPushButton::clicked, this, &MainWindow::loadSample);
    connect(abilitiesButton_, &QPushButton::clicked, this, [this]() { setPage(RenderPage::Abilities); });
    connect(statsButton_, &QPushButton::clicked, this, [this]() { setPage(RenderPage::Stats); });
    connect(exportButton, &QPushButton::clicked, this, &MainWindow::exportPng);
    connect(copyButton, &QPushButton::clicked, this, &MainWindow::copyImage);
    connect(editor_, &QPlainTextEdit::textChanged, this, &MainWindow::refreshPreview);
    connect(slotEdit_, &QLineEdit::textChanged, this, &MainWindow::refreshPreview);
    connect(teamIdEdit_, &QLineEdit::textChanged, this, &MainWindow::refreshPreview);
    connect(trainerNameEdit_, &QLineEdit::textChanged, this, &MainWindow::refreshPreview);
    connect(avatarTextEdit_, &QLineEdit::textChanged, this, &MainWindow::refreshPreview);
    loadSample();
}

void MainWindow::loadSample()
{
    const auto text = readTextFile(QStringLiteral("assets/samples/chengziteam.txt"));
    if (text.isEmpty()) {
        messages_->setText(QStringLiteral("无法读取 assets/samples/chengziteam.txt"));
        return;
    }
    editor_->setPlainText(text);
}

ParseResult MainWindow::parseCurrentInput() const
{
    auto result = parser_.parseShowdownText(editor_->toPlainText());
    result.team.slot = slotEdit_->text().trimmed().isEmpty() ? QStringLiteral("栏位4") : slotEdit_->text().trimmed();
    result.team.teamId = teamIdEdit_->text().trimmed().isEmpty() ? QStringLiteral("78PR64HN5F") : teamIdEdit_->text().trimmed();
    result.team.trainerName = trainerNameEdit_->text().trimmed().isEmpty() ? QStringLiteral("橙子") : trainerNameEdit_->text().trimmed();
    result.team.avatarText = avatarTextEdit_->text().trimmed().isEmpty() ? result.team.trainerName.left(1) : avatarTextEdit_->text().trimmed();
    return result;
}

void MainWindow::refreshPreview()
{
    auto result = parseCurrentInput();
    const auto summary = analyzer_.summarize(result.team);
    currentImage_ = renderer_.render(result.team, summary, page_);
    preview_->setPixmap(QPixmap::fromImage(currentImage_).scaled(preview_->size(), Qt::KeepAspectRatio, Qt::SmoothTransformation));
    showMessages(result, summary);
}

void MainWindow::setPage(RenderPage page)
{
    page_ = page;
    abilitiesButton_->setChecked(page == RenderPage::Abilities);
    statsButton_->setChecked(page == RenderPage::Stats);
    refreshPreview();
}

void MainWindow::exportPng()
{
    const auto defaultPath = QStandardPaths::writableLocation(QStandardPaths::PicturesLocation) + QLatin1Char('/') + outputName();
    const auto path = QFileDialog::getSaveFileName(this, QStringLiteral("保存分享图"), defaultPath, QStringLiteral("PNG Images (*.png)"));
    if (path.isEmpty()) return;
    QString error;
    const auto result = parseCurrentInput();
    const auto summary = analyzer_.summarize(result.team);
    if (!ShareController().savePng(renderer_.renderShareImage(result.team, summary), path, &error)) {
        QMessageBox::warning(this, QStringLiteral("导出失败"), error);
    }
}

void MainWindow::copyImage()
{
    ShareController().copyImageToClipboard(currentImage_);
    messages_->setText(QStringLiteral("已复制当前图片到剪贴板"));
}

void MainWindow::showMessages(const ParseResult& result, const TeamSummary& summary)
{
    QStringList lines;
    lines.append(QStringLiteral("已识别 %1/6 只，队伍精神：%2").arg(result.team.members.size()).arg(summary.primaryStyle));
    lines.append(result.errors);
    lines.append(result.warnings);
    lines.append(summary.warnings);
    for (const auto& member : result.team.members) {
        for (const auto& warning : member.warnings) lines.append(QStringLiteral("%1：%2").arg(member.localizedName, warning));
    }
    messages_->setText(lines.join(QStringLiteral("\n")));
}

} // namespace poketeam
