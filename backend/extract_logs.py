import subprocess

def main():
    out_file = "backend_debug_logs.txt"
    with open(out_file, "w", encoding="utf-8") as f:
        f.write("=== DOCKER API LOGS ===\n")
        try:
            # Extract the last 150 lines to catch the exact LLM interaction
            res = subprocess.run(
                ["docker", "compose", "logs", "--tail=150", "api"], 
                capture_output=True, 
                text=True
            )
            f.write(res.stdout)
            f.write(res.stderr)
        except Exception as e:
            f.write(f"Failed to get logs: {e}\n")
            
    print(f"✅ Backend debug logs extracted to {out_file}. Please upload it.")

if __name__ == "__main__":
    main()
