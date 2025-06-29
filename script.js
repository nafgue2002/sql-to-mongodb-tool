// script.js - Convertisseur SQL vers MongoDB

class SQLParser {
    constructor() {
        this.tables = {};
        this.relationships = [];
        this.analysis = [];
    }

    // Fonction principale pour analyser le SQL
    parseSQL(sqlText) {
        this.tables = {};
        this.relationships = [];
        this.analysis = [];

        // Nettoyer le texte SQL
        const cleanSQL = this.cleanSQL(sqlText);
        
        // Extraire les tables
        this.extractTables(cleanSQL);
        
        // Analyser les relations
        this.analyzeRelationships();
        
        // Appliquer les règles de conversion
        return this.applyConversionRules();
    }

    // Nettoyer le texte SQL
    cleanSQL(sql) {
        return sql
            .replace(/--.*$/gm, '') // Supprimer les commentaires
            .replace(/\/\*[\s\S]*?\*\//g, '') // Supprimer les commentaires multi-lignes
            .replace(/\s+/g, ' ') // Normaliser les espaces
            .trim();
    }

    // Extraire les tables et leurs champs
    extractTables(sql) {
        const createTableRegex = /CREATE\s+TABLE\s+(\w+)\s*\(([\s\S]*?)\);/gi;
        let match;

        while ((match = createTableRegex.exec(sql)) !== null) {
            const tableName = match[1].toLowerCase();
            const tableContent = match[2];
            
            this.tables[tableName] = {
                name: tableName,
                fields: {},
                primaryKeys: [],
                foreignKeys: [],
                rawContent: tableContent
            };

            this.parseTableContent(tableName, tableContent);
        }
    }

    // Analyser le contenu d'une table
    parseTableContent(tableName, content) {
        const lines = content.split(',').map(line => line.trim());
        
        for (let line of lines) {
            line = line.trim();
            
            if (/^PRIMARY\s+KEY/i.test(line)) {
                this.parsePrimaryKey(tableName, line);
            } else if (/^FOREIGN\s+KEY/i.test(line)) {
                this.parseForeignKey(tableName, line);
            } else if (line) {
                this.parseField(tableName, line);
            }
            
        }
    }

    // Analyser un champ
    parseField(tableName, fieldLine) {
        const fieldMatch = fieldLine.match(/(\w+)\s+(\w+(?:\(\d+(?:,\s*\d+)?\))?)/i);
        if (fieldMatch) {
            const fieldName = fieldMatch[1];
            const fieldType = fieldMatch[2];
            
            this.tables[tableName].fields[fieldName] = {
                type: this.convertSQLTypeToMongoDB(fieldType),
                required: fieldLine.toUpperCase().includes('NOT NULL'),
                primaryKey: fieldLine.toUpperCase().includes('PRIMARY KEY'),
                foreignKey: false
            };

            if (fieldLine.toUpperCase().includes('PRIMARY KEY')) {
                this.tables[tableName].primaryKeys.push(fieldName);
            }
        }
    }

    // Analyser les clés primaires
    parsePrimaryKey(tableName, line) {
        const pkMatch = line.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
        if (pkMatch) {
            const keys = pkMatch[1].split(',').map(k => k.trim());
            this.tables[tableName].primaryKeys.push(...keys);
            
            keys.forEach(key => {
                if (this.tables[tableName].fields[key]) {
                    this.tables[tableName].fields[key].primaryKey = true;
                    this.tables[tableName].fields[key].required = true;
                }
            });
        }
    }

    // Analyser les clés étrangères
    parseForeignKey(tableName, line) {
        const fkMatch = line.match(/FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+(\w+)\s*\(([^)]+)\)/i);
        if (fkMatch) {
            const foreignKey = fkMatch[1].trim();
            const referencedTable = fkMatch[2].toLowerCase();
            const referencedKey = fkMatch[3].trim();
            
            this.tables[tableName].foreignKeys.push({
                field: foreignKey,
                referencedTable: referencedTable,
                referencedField: referencedKey
            });

            if (this.tables[tableName].fields[foreignKey]) {
                this.tables[tableName].fields[foreignKey].foreignKey = true;
            }
        }
    }

    // Convertir les types SQL vers MongoDB
    convertSQLTypeToMongoDB(sqlType) {
        const typeMap = {
            'INT': 'Number',
            'INTEGER': 'Number',
            'BIGINT': 'Number',
            'SMALLINT': 'Number',
            'DECIMAL': 'Decimal',
            'NUMERIC': 'Decimal',
            'FLOAT': 'Number',
            'DOUBLE': 'Number',
            'VARCHAR': 'String',
            'CHAR': 'String',
            'TEXT': 'String',
            'DATE': 'Date',
            'DATETIME': 'Date',
            'TIMESTAMP': 'Date',
            'BOOLEAN': 'Boolean',
            'BOOL': 'Boolean'
        };

        const baseType = sqlType.toUpperCase().replace(/\([^)]*\)/, '');
        return typeMap[baseType] || 'String';
    }

    // Analyser les relations entre tables
    analyzeRelationships() {
        for (let tableName in this.tables) {
            const table = this.tables[tableName];
            
            for (let fk of table.foreignKeys) {
                const relationship = {
                    from: tableName,
                    to: fk.referencedTable,
                    fromField: fk.field,
                    toField: fk.referencedField,
                    type: this.determineRelationshipType(tableName, fk.referencedTable)
                };
                
                this.relationships.push(relationship);
            }
        }
    }

    // Déterminer le type de relation
determineRelationshipType(fromTable, toTable) {
    // Vérifier si c'est une table de liaison (N:M)
    if (this.isJunctionTable(fromTable)) {
        return 'N:M';
    }
    
    // Vérifier si c'est une relation 1:1
    const fromFKs = this.tables[fromTable].foreignKeys.filter(fk => fk.referencedTable === toTable);
    
    for (let fk of fromFKs) {
        const fkField = this.tables[fromTable].fields[fk.field];
        // إذا كان المفتاح الأجنبي هو أيضاً مفتاح أساسي، فهي علاقة 1:1
        if (fkField && fkField.primaryKey) {
            return '1:1';
        }
    }
    
    return 'N:1';
}

    // Vérifier si c'est une table de liaison
    isJunctionTable(tableName) {
        const table = this.tables[tableName];
        const totalFields = Object.keys(table.fields).length;
        const fkCount = table.foreignKeys.length;
        
        // Si la table a principalement des clés étrangères
        return fkCount >= 2 && fkCount >= totalFields * 0.5;
    }

//*********************************************
                                                                                                                                         // Appliquer les règles de conversion
applyConversionRules() {
    const result = {};

    for (let tableName in this.tables) {
        result[tableName] = {
            fields: {},
            relationships: []
        };

        // إضافة الحقول العادية
        for (let fieldName in this.tables[tableName].fields) {
            const field = this.tables[tableName].fields[fieldName];

            const fieldObj = {
                type: field.type,
                required: field.required || field.primaryKey || false
            };

            if (field.primaryKey) fieldObj.primaryKey = true;
            if (field.foreignKey) fieldObj.foreignKey = true;

            result[tableName].fields[fieldName] = fieldObj;
        }

        // معالجة العلاقات
        const tableRelationships = this.relationships.filter(rel => rel.from === tableName);

        for (let rel of tableRelationships) {
            const strategy = this.chooseStrategy(rel);

            let relationType = rel.type;
            if (relationType === 'one-to-one') relationType = '1:1';
            else if (relationType === 'one-to-many') relationType = '1:N';
            else if (relationType === 'many-to-one') relationType = 'N:1';
            else if (relationType === 'many-to-many') relationType = 'N:N';

            let description = '';
            if (strategy === 'embedding') {
                //  التضمين الكامل: إدراج جميع الحقول من الجدول المرتبط
                const embeddedFields = this.tables[rel.to]?.fields || {};
                for (let fieldName in embeddedFields) {
                    result[tableName].fields[`${rel.to}_${fieldName}`] = {
                        type: embeddedFields[fieldName].type,
                        embeddedFrom: rel.to
                    };
                }    

                description = `Les données complètes de ${rel.to} sont intégrées dans le document ${tableName} sous forme d'objet imbriqué.`;
            } else {
                description = `Référence vers la collection ${rel.to} via le champ ${rel.fromField} pour éviter la duplication et faciliter la mise à jour.`;
            }

            result[tableName].relationships.push({
                relationType: relationType,
                with: rel.to,
                foreignField: rel.fromField,
                strategy: strategy,
                description: description
            });

            const strategyName = strategy === 'embedding' ? 'imbrication' : 'référencement';

            this.analysis.push(
                `La relation ${relationType} entre ${rel.from} et ${rel.to} utilise la stratégie de ${strategyName}, avec le champ "${rel.fromField}".`
            );
        }
    }

    return {
        collections: result,
        relationships_analysis: this.analysis
    };
}
    //************************************
// تقدير حجم الجدول
estimateTableSize(tableName) {
    if (!this.tables[tableName]) return 'unknown';
    
    const fieldCount = Object.keys(this.tables[tableName].fields).length;
    const tableNameLower = tableName.toLowerCase();
    
    // جداول صغيرة معروفة
    const smallTables = ['adresse', 'address', 'contact', 'profile', 'setting', 'config'];
    if (smallTables.some(small => tableNameLower.includes(small)) || fieldCount <= 5) {
        return 'small';
    }
    
    // جداول كبيرة معروفة
    const largeTables = ['commande', 'order', 'facture', 'invoice', 'log', 'vendre', 'audit', 'historique'];
    if (largeTables.some(large => tableNameLower.includes(large)) || fieldCount > 10) {
        return 'large';
    }
    
    return 'medium';
}

// تحديد البيانات المرجعية
isReferenceData(tableName) {
    const tableNameLower = tableName.toLowerCase();
    const referenceTables = [
        'marque', 'brand', 'category', 'categorie', 'type', 'statut', 'status',
        'wilaya', 'ville', 'city', 'country', 'pays', 'region', 'devise', 'currency'
    ];
    
    return referenceTables.some(ref => tableNameLower.includes(ref));
}

// تحديد تكرار الوصول
isFrequentlyAccessed(fromTable, toTable) {
    const fromTableLower = fromTable.toLowerCase();
    const toTableLower = toTable.toLowerCase();
    
    // العلاقات التي تُستعلم عادة معاً
    const frequentPairs = [
        ['user', 'profile'], ['utilisateur', 'profil'],
        ['product', 'category'], ['produit', 'categorie'],
        ['commande', 'client'], ['order', 'customer'],
        ['vehicule', 'marque'], ['vehicle', 'brand']
    ];
    
    return frequentPairs.some(pair => 
        (fromTableLower.includes(pair[0]) && toTableLower.includes(pair[1])) ||
        (fromTableLower.includes(pair[1]) && toTableLower.includes(pair[0]))
    );
}

// تحديد الارتباط المباشر
isDirectlyRelated(fromTable, toTable) {
    const fromTableLower = fromTable.toLowerCase();
    const toTableLower = toTable.toLowerCase();
    
    // العلاقات المباشرة (جزء من الكيان الأساسي)
    const directRelations = [
        ['article', 'commentaire'], ['blog', 'comment'],
        ['user', 'adresse'], ['utilisateur', 'address'],
        ['commande', 'ligne'], ['order', 'item']
    ];
    
    return directRelations.some(pair => 
        fromTableLower.includes(pair[0]) && toTableLower.includes(pair[1])
    );
}

// تبرير اختيار الاستراتيجية
getStrategyReason(relationship, strategy) {
    const relType = relationship.type;
    const toTable = relationship.to;
    
    if (strategy === 'embedding') {
        if (relType === 'one-to-one') {
            return 'données liées directement et fréquemment consultées ensemble';
        }
        return 'sous-documents petits et directement liés au document parent';
    }
    
    if (strategy === 'referencing') {
        if (relType === 'many-to-many') {
            return 'relation complexe plusieurs-à-plusieurs';
        }
        if (relType === 'many-to-one') {
            return 'données de référence maintenues dans une collection séparée';
        }
        return 'données volumineuses ou accessibles indépendamment';
    }
    
    return 'stratégie par défaut';
}

// دوال مساعدة لتحديد خصائص البيانات
isSmallDataAndFrequentQueries(relationship) {
    // منطق لتحديد إذا كانت البيانات صغيرة والاستعلامات متكررة
    // يمكن تخصيصه حسب احتياجاتك
    const targetTable = this.tables[relationship.to];
    if (!targetTable) return false;
    
    const fieldCount = Object.keys(targetTable.fields).length;
    return fieldCount <= 5; // عدد الحقول قليل
}

isReadHeavyAndStableData(relationship) {
    // للبيانات التي تُقرأ كثيراً ولا تُحدث كثيراً
    // مثل: بيانات المدن، الدول، الفئات الثابتة
    const targetTable = relationship.to.toLowerCase();
    
    // قوائم الجداول التي عادة ما تكون مستقرة
    const stableTables = [
        'marque', 'brand', 'category', 'categorie', 
        'wilaya', 'ville', 'city', 'country', 'pays',
        'type', 'statut', 'status'
    ];
    
    return stableTables.some(stable => targetTable.includes(stable));
}

isLargeOrFrequentlyUpdated(relationship) {
    // للبيانات الكبيرة أو التي تُحدث بكثرة
    const targetTable = relationship.to.toLowerCase();
    
    // قوائم الجداول التي عادة ما تكون كبيرة أو متغيرة
    const dynamicTables = [
        'commande', 'order', 'transaction', 'facture', 'invoice',
        'log', 'audit', 'historique', 'history', 'message'
    ];
    
    return dynamicTables.some(dynamic => targetTable.includes(dynamic));
}
    // Choisir la stratégie de conversion
    chooseStrategy(relationship) {
        switch (relationship.type) {
            case '1:1':
                // علاقة 1:1 تُفضل الإدراج
                return 'embedding';
    
            case '1:N':
            case 'N:1':
                // إذا كانت العلاقة بسيطة ويمكن إدراجها
                if (relationship.embedWhenSmall) {
                    return 'embedding';
                }
                return 'referencing';
    
            case 'N:M':
                // العلاقات N:M يجب استخدام referencing
                return 'referencing';
    
            default:
                return 'referencing';
        }
    }
    
}

// ***********************
// Gestionnaire de l'interface utilisateur
class UIManager {
    constructor() {
        this.parser = new SQLParser();
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // Bouton d'analyse
        document.getElementById('analyzeBtn').addEventListener('click', () => {
            this.analyzeSQL();
        });

        // Bouton de nettoyage
        document.getElementById('clearBtn').addEventListener('click', () => {
            this.clearAll();
        });

        // Upload de fichier
        document.getElementById('sqlFile').addEventListener('change', (e) => {
            this.handleFileUpload(e);
        });

        // Drag and drop
        const uploadBox = document.getElementById('uploadBox');
        uploadBox.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadBox.classList.add('dragover');
        });

        uploadBox.addEventListener('dragleave', () => {
            uploadBox.classList.remove('dragover');
        });

        uploadBox.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadBox.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.processFile(files[0]);
            }
        });

        // Boutons de téléchargement
        document.getElementById('downloadJson').addEventListener('click', () => {
            this.downloadResult('json');
        });

        document.getElementById('downloadTxt').addEventListener('click', () => {
            this.downloadResult('txt');
        });
    }

    // Analyser le SQL
    async analyzeSQL() {
        const sqlInput = document.getElementById('sqlInput').value.trim();
        
        if (!sqlInput) {
            alert('Veuillez saisir du code SQL ou charger un fichier SQL.');
            return;
        }

        this.showLoading();

        try {
            // Simuler un délai pour l'analyse
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const result = this.parser.parseSQL(sqlInput);
            this.displayResults(result);
            
        } catch (error) {
            console.error('Erreur lors de l\'analyse:', error);
            alert('Erreur lors de l\'analyse du SQL. Veuillez vérifier votre code.');
        } finally {
            this.hideLoading();
        }
    }

    // Afficher les résultats
    displayResults(result) {
        // Afficher l'analyse des relations
        this.displayRelationshipAnalysis(result.relationships_analysis);
        
        // Afficher le résultat JSON
        this.displayJSONResult(result.collections);
        
        // Stocker le résultat pour le téléchargement
        this.currentResult = result;
        
        // Afficher les sections
        document.getElementById('analysisSection').style.display = 'block';
        document.getElementById('resultsSection').style.display = 'block';
        
        // Faire défiler vers les résultats
        document.getElementById('analysisSection').scrollIntoView({ behavior: 'smooth' });
    }

    // Afficher l'analyse des relations
    displayRelationshipAnalysis(analysis) {
        const container = document.getElementById('relationsContainer');
        container.innerHTML = '';
        
        analysis.forEach((relation, index) => {
            const card = document.createElement('div');
            card.className = 'relation-card';
            card.innerHTML = `
                <div class="relation-type">Relation ${index + 1}</div>
                <div class="relation-description">${relation}</div>
            `;
            container.appendChild(card);
        });
    }

    // Afficher le résultat JSON
    displayJSONResult(collections) {
        const resultCode = document.getElementById('resultCode');
        
        // إنشاء نسخة معدلة من البيانات لإظهار primaryKey بوضوح
        const modifiedCollections = {};
        
        for (let collectionName in collections) {
            modifiedCollections[collectionName] = {
                fields: {},
                relationships: collections[collectionName].relationships
            };
            
            // نسخ جميع الحقول مع إظهار primaryKey
            for (let fieldName in collections[collectionName].fields) {
                const field = collections[collectionName].fields[fieldName];
                modifiedCollections[collectionName].fields[fieldName] = {
                    type: field.type,
                    required: field.required
                };
                
                // إضافة primaryKey فقط إذا كان true
                if (field.primaryKey) {
                    modifiedCollections[collectionName].fields[fieldName].primaryKey = true;
                }
                
                // إضافة foreignKey فقط إذا كان true
                if (field.foreignKey) {
                    modifiedCollections[collectionName].fields[fieldName].foreignKey = true;
                }
            }
        }
        
        resultCode.textContent = JSON.stringify(modifiedCollections, null, 2);
        
        const resultInfo = document.getElementById('resultInfo');
        const collectionCount = Object.keys(collections).length;
        resultInfo.textContent = `Conversion réussie - ${collectionCount} collection(s) générée(s)`;
    }

    // Gérer l'upload de fichier
    handleFileUpload(event) {
        const file = event.target.files[0];
        if (file) {
            this.processFile(file);
        }
    }

    // Traiter le fichier
    processFile(file) {
        if (!file.name.toLowerCase().endsWith('.sql')) {
            alert('Veuillez sélectionner un fichier SQL (.sql)');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            document.getElementById('sqlInput').value = content;
            this.showFileInfo(file.name);
        };
        reader.readAsText(file);
    }

    // Afficher les informations du fichier
    showFileInfo(filename) {
        document.getElementById('fileName').textContent = filename;
        document.getElementById('fileInfo').style.display = 'flex';
        document.getElementById('uploadBox').style.display = 'none';
    }

    // Supprimer le fichier
    removeFile() {
        document.getElementById('sqlFile').value = '';
        document.getElementById('fileInfo').style.display = 'none';
        document.getElementById('uploadBox').style.display = 'block';
        document.getElementById('sqlInput').value = '';
    }

    // Télécharger le résultat
    downloadResult(format) {
        if (!this.currentResult) {
            alert('Aucun résultat à télécharger. Veuillez d\'abord analyser le SQL.');
            return;
        }

        const content = format === 'json' 
            ? JSON.stringify(this.currentResult, null, 2)
            : this.formatResultAsText(this.currentResult);
            
        const blob = new Blob([content], { 
            type: format === 'json' ? 'application/json' : 'text/plain' 
        });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mongodb_schema.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Formater le résultat en texte
    formatResultAsText(result) {
        let text = 'SCHÉMA MONGODB GÉNÉRÉ\n';
        text += '='.repeat(50) + '\n\n';
        
        text += 'ANALYSE DES RELATIONS:\n';
        text += '-'.repeat(25) + '\n';
        result.relationships_analysis.forEach((relation, index) => {
            text += `${index + 1}. ${relation}\n`;
        });
        
        text += '\n\nCOLLECTIONS:\n';
        text += '-'.repeat(15) + '\n';
        
        for (let collectionName in result.collections) {
            const collection = result.collections[collectionName];
            text += `\n${collectionName.toUpperCase()}:\n`;
            text += `  Champs:\n`;
            
            for (let fieldName in collection.fields) {
                const field = collection.fields[fieldName];
                text += `    - ${fieldName}: ${field.type}`;
                if (field.primaryKey) text += ' (Clé primaire)';
                if (field.foreignKey) text += ' (Clé étrangère)';
                if (field.required) text += ' (Obligatoire)';
                text += '\n';
            }
            
            if (collection.relationships.length > 0) {
                text += `  Relations:\n`;
                collection.relationships.forEach(rel => {
                    text += `    - ${rel.type} vers ${rel.target} (${rel.strategy})\n`;
                });
            }
        }
        
        return text;
    }

    // Afficher le loading
    showLoading() {
        document.getElementById('loadingOverlay').style.display = 'flex';
    }

    // Masquer le loading
    hideLoading() {
        document.getElementById('loadingOverlay').style.display = 'none';
    }

    // Tout effacer
    clearAll() {
        document.getElementById('sqlInput').value = '';
        document.getElementById('analysisSection').style.display = 'none';
        document.getElementById('resultsSection').style.display = 'none';
        this.removeFile();
        this.currentResult = null;
    }
}

// Fonction globale pour supprimer le fichier (appelée depuis le HTML)
function removeFile() {
    if (window.uiManager) {
        window.uiManager.removeFile();
    }
}

// Initialiser l'application
document.addEventListener('DOMContentLoaded', () => {
    window.uiManager = new UIManager();
    console.log('Convertisseur SQL vers MongoDB initialisé');
});
