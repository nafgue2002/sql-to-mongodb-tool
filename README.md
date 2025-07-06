# SQL to MongoDB Tool

Ce projet propose un outil simple permettant de transformer automatiquement des schémas SQL (à partir des instructions `CREATE TABLE`) vers une structure orientée document adaptée à MongoDB.

## 🌐 Interface

L’outil dispose d’une interface web composée des fichiers suivants :
- `index.html` : page principale de l’outil
- `style.css` : styles de l’interface
- `script.js` : logique de traitement côté client

## 🐍 Traitement serveur

- `app.py` : script Python pour analyser les fichiers SQL et appliquer les règles de transformation vers MongoDB.

## 📦 Fonctionnalités

- Extraction automatique des entités, attributs, clés primaires/étrangères
- Détection des relations (1:1, 1:N, N:M)
- Application de stratégies de transformation (imbrication, référence)
- Génération d’un modèle document JSON

## 📁 Exemple

Chargez un fichier contenant des instructions `CREATE TABLE`, et l’outil générera la structure correspondante en MongoDB.

## 🔗 Lien

Le dépôt complet est accessible ici :  
👉 [https://github.com/nafgue2002/sql-to-mongodb-tool](https://github.com/nafgue2002/sql-to-mongodb-tool)
---

## À propos de l’auteure

Développé par **Nafissa Gueffaf**, étudiante ingénieure en Informatique, spécialité "Systèmes D'information et de Décision", promotion 2025.

Projet réalisé dans le cadre du mémoire de fin d’études.
