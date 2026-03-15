import os

FILES_TO_EXTRACT = [
    "src/ib/runner_daemon.py",
    "src/api/routers/portfolio.py",
    "src/engine/portfolio.py"
]

def main():
    output_filename = "backend_deadlock_files.txt"
    output_content = ""

    for filepath in FILES_TO_EXTRACT:
        safe_path = os.path.normpath(filepath)
        
        if os.path.exists(safe_path):
            try:
                with open(safe_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                output_content += f"--- START OF {filepath} ---\n\n"
                output_content += content
                output_content += f"\n\n--- END OF {filepath} ---\n\n"
            except Exception as e:
                output_content += f"--- ERROR READING {filepath}: {e} ---\n\n"
        else:
            output_content += f"--- FILE NOT FOUND: {filepath} ---\n\n"

    with open(output_filename, 'w', encoding='utf-8') as out_f:
        out_f.write(output_content)

    print(f"✅ Extraction complete! Please send me the contents of '{output_filename}'.")

if __name__ == "__main__":
    main()
