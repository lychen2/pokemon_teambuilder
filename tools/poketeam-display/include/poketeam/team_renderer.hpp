#pragma once

#include "poketeam/data_repository.hpp"
#include "poketeam/team_model.hpp"

#include <QImage>
#include <QSize>

namespace poketeam {

enum class RenderPage { Abilities, Stats };

class TeamRenderer {
public:
    explicit TeamRenderer(const DataRepository& data);

    QImage render(
        const Team& team,
        const TeamSummary& summary,
        RenderPage page,
        QSize size = QSize(2622, 1206)
    ) const;
    QImage renderShareImage(
        const Team& team,
        const TeamSummary& summary,
        QSize pageSize = QSize(5244, 2412)
    ) const;

private:
    const DataRepository& data_;
};

} // namespace poketeam
