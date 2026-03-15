import os

FILES_TO_EXTRACT = [
    "src/engine/backtest.py",
    "src/engine/reporting.py",
    "src/engine/types.py",
    "src/worker/tasks.py"
]

def main():
    output_filename = "be_sim_files.txt"
    output_content = ""
    for filepath in FILES_TO_EXTRACT:
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as f:
                output_content += f"--- START OF {filepath} ---\n\n{f.read()}\n\n--- END OF {filepath} ---\n\n"
        else:
            output_content += f"--- FILE NOT FOUND: {filepath} ---\n\n"
    
    with open(output_filename, 'w', encoding='utf-8') as f:
        f.write(output_content)
    print(f"✅ Backend extraction complete: {output_filename}")

if __name__ == "__main__":
    main()
