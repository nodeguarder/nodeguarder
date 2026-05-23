use std::path::Path;

fn main() {
    // Compile gRPC proto for enterprise feature
    let proto_path = Path::new("proto").join("agent.proto");
    if proto_path.exists() {
        let protoc_path = protoc_bin_vendored::protoc_bin_path()
            .expect("protoc-bin-vendored failed to resolve protoc path");
        std::env::set_var("PROTOC", protoc_path.as_os_str());
        tonic_build::compile_protos(&proto_path)
            .unwrap_or_else(|e| panic!("Failed to compile proto: {}", e));
        println!("cargo:rerun-if-changed=proto/agent.proto");
    }

    let target = std::env::var("TARGET").unwrap_or_default();
    if !target.contains("windows") {
        return;
    }

    let out_dir = std::env::var("OUT_DIR").unwrap();
    let out_dir = Path::new(&out_dir);
    let target_dir = out_dir.ancestors().nth(3).unwrap();

    let dll_path = target_dir.join("onnxruntime.dll");

    if dll_path.exists() {
        return;
    }

    println!("cargo:warning=Downloading ONNX Runtime 1.24.2 DirectML from NuGet...");

    let url = "https://www.nuget.org/api/v2/package/Microsoft.ML.OnnxRuntime.DirectML/1.24.2";
    let nupkg_path = target_dir.join("Microsoft.ML.OnnxRuntime.DirectML.1.24.2.nupkg");

    let status = std::process::Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-Command",
            &format!("Invoke-WebRequest -Uri '{}' -OutFile '{}'", url, nupkg_path.to_str().unwrap()),
        ])
        .status()
        .expect("Failed to execute PowerShell for download");

    if !status.success() {
        panic!("Failed to download ONNX Runtime DirectML from {}", url);
    }

    println!("cargo:warning=Extracting onnxruntime.dll...");

    let extract_dir = target_dir.join("onnxruntime_extracted");
    let status = std::process::Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-Command",
            &format!("Expand-Archive -Path '{}' -DestinationPath '{}' -Force", nupkg_path.to_str().unwrap(), extract_dir.to_str().unwrap()),
        ])
        .status()
        .expect("Failed to execute PowerShell for extraction");

    if !status.success() {
        let _ = std::fs::remove_file(&nupkg_path);
        panic!("Failed to extract ONNX Runtime NuGet package. Try downloading manually from {} and place onnxruntime.dll in {}", url, target_dir.display());
    }

    // NuGet package structure: runtimes/win-x64/native/onnxruntime.dll
    let source_dll = extract_dir.join("runtimes").join("win-x64").join("native").join("onnxruntime.dll");

    if !source_dll.exists() {
        let _ = std::fs::remove_file(&nupkg_path);
        let _ = std::fs::remove_dir_all(&extract_dir);
        panic!("onnxruntime.dll not found in extracted archive at {:?}", source_dll);
    }

    std::fs::copy(&source_dll, &dll_path).expect("Failed to copy onnxruntime.dll to target directory");

    // Also copy to deps/ so test binaries can find the DLL
    let deps_dir = target_dir.join("deps");
    let dll_in_deps = deps_dir.join("onnxruntime.dll");
    if !dll_in_deps.exists() {
        let _ = std::fs::copy(&source_dll, &dll_in_deps);
    }

    let _ = std::fs::remove_file(&nupkg_path);
    let _ = std::fs::remove_dir_all(&extract_dir);

    println!("cargo:warning=onnxruntime.dll ready at {:?}", dll_path);
}
