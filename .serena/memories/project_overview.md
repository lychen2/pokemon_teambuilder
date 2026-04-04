# Project Overview

This is a Flask-based Pokémon team builder and type calculator web application written in Python with a Chinese language interface.

## Purpose
- Interactive Pokémon type effectiveness calculator
- Team composition builder with 6-slot management
- Team analysis and AI-powered recommendations
- Pokémon ban list management with presets

## Tech Stack
- **Backend**: Python Flask web framework
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Data**: JSON files for Pokémon database and configurations
- **Sprites**: PNG sprite sheets with coordinate-based rendering
- **No external dependencies**: Uses only Python standard library

## Key Features
1. **Type Calculator Mode**: Interactive type selection and effectiveness analysis
2. **Team Builder Mode**: Drag-and-drop team management with search/filtering
3. **Ban Management Mode**: Import/export ban lists with preset configurations
4. **AI Recommendations**: Algorithm suggests Pokémon based on team weaknesses
5. **Sprite System**: Dynamic coordinate calculation for 40x30px sprites (12 per row)

## Data Architecture
- `pokedex.json`: Complete Pokémon database (~482KB)
- `forms_index.json`: Sprite index mappings
- `ban_presets.json`: Predefined ban lists (Uber, nddoubles tiers)
- TYPE_EFFECTIVENESS matrix: 18x18 type matchup calculations