#pragma once

#include "poketeam/data_repository.hpp"
#include "poketeam/team_analyzer.hpp"
#include "poketeam/team_parser.hpp"
#include "poketeam/team_renderer.hpp"

#include <QImage>
#include <QLabel>
#include <QLineEdit>
#include <QMainWindow>
#include <QPlainTextEdit>
#include <QPushButton>
#include <QString>

namespace poketeam {

class MainWindow : public QMainWindow {
    Q_OBJECT

public:
    explicit MainWindow(QWidget* parent = nullptr);

private:
    void loadSample();
    ParseResult parseCurrentInput() const;
    void refreshPreview();
    void setPage(RenderPage page);
    void exportPng();
    void copyImage();
    void showMessages(const ParseResult& result, const TeamSummary& summary);

    DataRepository data_;
    TeamParser parser_;
    TeamAnalyzer analyzer_;
    TeamRenderer renderer_;
    QPlainTextEdit* editor_ = nullptr;
    QLabel* preview_ = nullptr;
    QLabel* messages_ = nullptr;
    QLineEdit* slotEdit_ = nullptr;
    QLineEdit* teamIdEdit_ = nullptr;
    QLineEdit* trainerNameEdit_ = nullptr;
    QLineEdit* avatarTextEdit_ = nullptr;
    QPushButton* abilitiesButton_ = nullptr;
    QPushButton* statsButton_ = nullptr;
    RenderPage page_ = RenderPage::Abilities;
    QImage currentImage_;
};

} // namespace poketeam
