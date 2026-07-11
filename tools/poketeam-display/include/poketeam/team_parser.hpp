#pragma once

#include "poketeam/data_repository.hpp"
#include "poketeam/team_model.hpp"

#include <QString>

namespace poketeam {

class TeamParser {
public:
    explicit TeamParser(const DataRepository& data);

    ParseResult parseShowdownText(const QString& text) const;

private:
    const DataRepository& data_;
};

} // namespace poketeam
