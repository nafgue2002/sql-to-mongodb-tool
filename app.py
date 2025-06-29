# app.py
from flask import Flask, render_template, request, jsonify
import re
import json
from typing import Dict, List, Tuple

app = Flask(__name__)

class SQLToMongoConverter:
    def __init__(self):
        self.tables = {}
        self.relationships = []
        self.mongo_collections = {}
        
    def parse_sql(self, sql_content: str) -> Dict:
        """Parse SQL content and extract tables and relationships"""
        try:
            # Clean the SQL content
            sql_content = self.clean_sql(sql_content)
            
            # Extract tables
            self.extract_tables(sql_content)
            
            # Extract foreign keys and relationships
            self.extract_relationships(sql_content)
            
            # Convert to MongoDB schema
            self.convert_to_mongodb()
            
            return {
                'success': True,
                'tables': self.tables,
                'relationships': self.relationships,
                'mongodb_schema': self.mongo_collections
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    def clean_sql(self, sql_content: str) -> str:
        """Clean and normalize SQL content"""
        # Remove comments
        sql_content = re.sub(r'--.*?\n', '\n', sql_content)
        sql_content = re.sub(r'/\*.*?\*/', '', sql_content, flags=re.DOTALL)
        
        # Normalize whitespace
        sql_content = re.sub(r'\s+', ' ', sql_content)
        
        return sql_content.strip()
    
    def extract_tables(self, sql_content: str):
        """Extract table definitions from SQL"""
        # Pattern to match CREATE TABLE statements
        table_pattern = r'CREATE\s+TABLE\s+(\w+)\s*\((.*?)\)'
        
        matches = re.findall(table_pattern, sql_content, re.IGNORECASE | re.DOTALL)
        
        for table_name, columns_str in matches:
            columns = self.parse_columns(columns_str)
            self.tables[table_name.lower()] = {
                'name': table_name,
                'columns': columns,
                'primary_key': self.find_primary_key(columns),
                'foreign_keys': []
            }
    
    def parse_columns(self, columns_str: str) -> List[Dict]:
        """Parse column definitions"""
        columns = []
        
        # Split by comma, but be careful with constraints
        column_parts = []
        current_part = ""
        paren_count = 0
        
        for char in columns_str:
            if char == '(':
                paren_count += 1
            elif char == ')':
                paren_count -= 1
            elif char == ',' and paren_count == 0:
                column_parts.append(current_part.strip())
                current_part = ""
                continue
            current_part += char
        
        if current_part.strip():
            column_parts.append(current_part.strip())
        
        for part in column_parts:
            part = part.strip()
            if not part or 'FOREIGN KEY' in part.upper() or 'PRIMARY KEY' in part.upper():
                continue
                
            # Parse individual column
            column_match = re.match(r'(\w+)\s+(\w+(?:\(\d+(?:,\s*\d+)?\))?)', part, re.IGNORECASE)
            if column_match:
                col_name = column_match.group(1)
                col_type = column_match.group(2)
                
                # Check for constraints
                is_primary = 'PRIMARY KEY' in part.upper()
                is_not_null = 'NOT NULL' in part.upper()
                
                columns.append({
                    'name': col_name,
                    'type': self.sql_to_mongo_type(col_type),
                    'sql_type': col_type,
                    'primary_key': is_primary,
                    'not_null': is_not_null
                })
        
        return columns
    
    def find_primary_key(self, columns: List[Dict]) -> str:
        """Find primary key column"""
        for col in columns:
            if col.get('primary_key'):
                return col['name']
        return None
    
    def sql_to_mongo_type(self, sql_type: str) -> str:
        """Convert SQL types to MongoDB types"""
        sql_type = sql_type.upper()
        
        if 'INT' in sql_type:
            return 'Number'
        elif 'VARCHAR' in sql_type or 'TEXT' in sql_type or 'CHAR' in sql_type:
            return 'String'
        elif 'DECIMAL' in sql_type or 'FLOAT' in sql_type or 'DOUBLE' in sql_type:
            return 'Number'
        elif 'DATE' in sql_type or 'TIME' in sql_type:
            return 'Date'
        elif 'BOOLEAN' in sql_type or 'BOOL' in sql_type:
            return 'Boolean'
        else:
            return 'Mixed'
    
    def extract_relationships(self, sql_content: str):
        """Extract foreign key relationships"""
        # Pattern for FOREIGN KEY constraints
        fk_pattern = r'FOREIGN\s+KEY\s*\((\w+)\)\s+REFERENCES\s+(\w+)\s*\((\w+)\)'
        
        matches = re.findall(fk_pattern, sql_content, re.IGNORECASE)
        
        for fk_col, ref_table, ref_col in matches:
            # Find which table this foreign key belongs to
            for table_name, table_info in self.tables.items():
                for col in table_info['columns']:
                    if col['name'].lower() == fk_col.lower():
                        relationship = {
                            'from_table': table_name,
                            'from_column': fk_col,
                            'to_table': ref_table.lower(),
                            'to_column': ref_col,
                            'type': self.determine_relationship_type(table_name, ref_table.lower())
                        }
                        self.relationships.append(relationship)
                        table_info['foreign_keys'].append(relationship)
                        break
    
    def determine_relationship_type(self, from_table: str, to_table: str) -> str:
        """Determine relationship type (1:1, 1:N, N:M)"""
        # For now, assume 1:N relationships
        # This can be enhanced with more sophisticated analysis
        return "1:N"
    
    def convert_to_mongodb(self):
        """Convert SQL schema to MongoDB collections"""
        for table_name, table_info in self.tables.items():
            collection = {
                'collection_name': table_name,
                'fields': {},
                'relationships': [],
                'strategy': 'reference'  # Default strategy
            }
            
            # Add fields
            for col in table_info['columns']:
                field_def = {
                    'type': col['type'],
                    'required': col.get('not_null', False)
                }
                
                if col.get('primary_key'):
                    field_def['primary'] = True
                
                collection['fields'][col['name']] = field_def
            
            # Handle relationships
            for rel in table_info['foreign_keys']:
                if rel['type'] == '1:N':
                    # For 1:N, we can embed or reference
                    strategy = self.choose_embedding_strategy(rel)
                    collection['relationships'].append({
                        'type': rel['type'],
                        'target': rel['to_table'],
                        'strategy': strategy,
                        'field': rel['from_column'],
                        'description': f"Relation {rel['type']} avec {rel['to_table']} - Stratégie: {strategy}"
                    })
            
            self.mongo_collections[table_name] = collection
    
    def choose_embedding_strategy(self, relationship: Dict) -> str:
        """Choose between embedding and referencing"""
        # Simple heuristics for demo
        # Règle 2 : Transformation d'une relation 1:N
        return "embedding"  # or "reference"

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/convert', methods=['POST'])
def convert_sql():
    try:
        data = request.get_json()
        sql_content = data.get('sql_content', '')
        
        if not sql_content.strip():
            return jsonify({
                'success': False,
                'error': 'Aucun contenu SQL fourni'
            })
        
        # Create converter instance
        converter = SQLToMongoConverter()
        result = converter.parse_sql(sql_content)
        
        if result['success']:
            # Format relationships for display
            formatted_relationships = []
            for rel in result['relationships']:
                formatted_relationships.append({
                    'description': f"Relation entre {rel['from_table']} et {rel['to_table']} : {rel['type']}",
                    'strategy': f"Stratégie utilisée : Embedding",
                    'rule': "Règle 2 : Transformation d'une relation 1:N"
                })
            
            # Format MongoDB schema for display
            formatted_schema = {}
            for collection_name, collection_info in result['mongodb_schema'].items():
                formatted_schema[collection_name] = {
                    'fields': collection_info['fields'],
                    'relationships': collection_info['relationships']
                }
            
            return jsonify({
                'success': True,
                'relationships': formatted_relationships,
                'mongodb_schema': formatted_schema,
                'formatted_output': json.dumps(formatted_schema, indent=2, ensure_ascii=False)
            })
        else:
            return jsonify(result)
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Erreur lors de la conversion : {str(e)}'
        })

@app.route('/upload', methods=['POST'])
def upload_file():
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'Aucun fichier fourni'})
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'Aucun fichier sélectionné'})
        
        if file and file.filename.endswith('.sql'):
            content = file.read().decode('utf-8')
            return jsonify({
                'success': True,
                'content': content,
                'filename': file.filename
            })
        else:
            return jsonify({'success': False, 'error': 'Le fichier doit être un fichier .sql'})
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Erreur lors du téléchargement : {str(e)}'
        })

if __name__ == '__main__':
    app.run(debug=True, port=5000)