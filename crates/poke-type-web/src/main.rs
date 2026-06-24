use std::{
    fs,
    io::{BufRead, BufReader, Write},
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::Command,
};

use anyhow::{Context, Result};

const HOST: &str = "127.0.0.1";
const DEFAULT_PORT: u16 = 8000;

fn main() -> Result<()> {
    let root = repo_root_from_cwd()?;
    let listener = bind_listener(DEFAULT_PORT)?;
    let address = listener.local_addr()?;
    let url = format!("http://{address}/");
    eprintln!("Poke Type Web UI: {url}");
    open_browser(&url);

    for stream in listener.incoming() {
        match stream {
            Ok(stream) => {
                if let Err(error) = handle_connection(stream, &root) {
                    eprintln!("request failed: {error:#}");
                }
            }
            Err(error) => eprintln!("connection failed: {error}"),
        }
    }
    Ok(())
}

fn bind_listener(preferred_port: u16) -> Result<TcpListener> {
    TcpListener::bind((HOST, preferred_port))
        .or_else(|_| TcpListener::bind((HOST, 0)))
        .context("failed to bind local web server")
}

fn handle_connection(mut stream: TcpStream, root: &Path) -> Result<()> {
    let mut reader = BufReader::new(stream.try_clone()?);
    let mut request_line = String::new();
    reader.read_line(&mut request_line)?;
    drain_headers(&mut reader)?;

    let Some(target) = request_path(&request_line) else {
        write_response(
            &mut stream,
            400,
            "text/plain; charset=utf-8",
            b"bad request",
        )?;
        return Ok(());
    };

    let Some(path) = safe_path(root, target) else {
        write_response(&mut stream, 403, "text/plain; charset=utf-8", b"forbidden")?;
        return Ok(());
    };

    if path.is_file() {
        let body = fs::read(&path).with_context(|| format!("failed to read {}", path.display()))?;
        write_response(&mut stream, 200, mime_type(&path), &body)?;
    } else {
        write_response(&mut stream, 404, "text/plain; charset=utf-8", b"not found")?;
    }
    Ok(())
}

fn request_path(request_line: &str) -> Option<&str> {
    let mut parts = request_line.split_whitespace();
    if parts.next()? != "GET" {
        return None;
    }
    parts.next()
}

fn drain_headers(reader: &mut BufReader<TcpStream>) -> Result<()> {
    let mut line = String::new();
    loop {
        line.clear();
        if reader.read_line(&mut line)? == 0 || line == "\r\n" || line == "\n" {
            break;
        }
    }
    Ok(())
}

fn safe_path(root: &Path, target: &str) -> Option<PathBuf> {
    let target = target.split('?').next().unwrap_or(target);
    let target = percent_decode(target).ok()?;
    let relative = if target == "/" {
        "index.html"
    } else {
        target.strip_prefix('/')?
    };
    let path = root.join(relative);
    let canonical_root = root.canonicalize().ok()?;
    if path.exists() {
        let canonical = path.canonicalize().ok()?;
        canonical.starts_with(canonical_root).then_some(canonical)
    } else {
        Some(path)
    }
}

fn percent_decode(input: &str) -> Result<String> {
    let bytes = input.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[index + 1..index + 3])?;
            output.push(u8::from_str_radix(hex, 16)?);
            index += 3;
        } else {
            output.push(bytes[index]);
            index += 1;
        }
    }
    Ok(String::from_utf8(output)?)
}

fn write_response(
    stream: &mut TcpStream,
    status: u16,
    content_type: &str,
    body: &[u8],
) -> Result<()> {
    let reason = match status {
        200 => "OK",
        400 => "Bad Request",
        403 => "Forbidden",
        404 => "Not Found",
        _ => "Error",
    };
    write!(
        stream,
        "HTTP/1.1 {status} {reason}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
        body.len()
    )?;
    stream.write_all(body)?;
    Ok(())
}

fn mime_type(path: &Path) -> &'static str {
    match path.extension().and_then(|ext| ext.to_str()).unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "js" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" | "webmanifest" => "application/json; charset=utf-8",
        "png" => "image/png",
        "csv" => "text/csv; charset=utf-8",
        "txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

fn repo_root_from_cwd() -> Result<PathBuf> {
    let current = std::env::current_dir()?;
    for ancestor in current.ancestors() {
        if ancestor.join("index.html").exists() && ancestor.join("static/app/main.js").exists() {
            return Ok(ancestor.to_path_buf());
        }
    }
    Ok(current)
}

fn open_browser(url: &str) {
    let commands: &[(&str, &[&str])] = &[("xdg-open", &[url]), ("gio", &["open", url])];
    for (program, args) in commands {
        if Command::new(program).args(*args).spawn().is_ok() {
            return;
        }
    }
}
