#pragma once

#include "poketeam/data_repository.hpp"
#include "poketeam/team_model.hpp"

namespace poketeam {

class TeamAnalyzer {
public:
    explicit TeamAnalyzer(const DataRepository& data);

    TeamSummary summarize(const Team& team) const;

private:
    const DataRepository& data_;
};

} // namespace poketeam
