use windows::{
    Graphics::Imaging::BitmapDecoder,
    Media::Ocr::OcrEngine,
    Storage::Streams::{InMemoryRandomAccessStream, DataWriter},
    core::Result,
};

pub async fn extract_text_from_image_bytes(data: Vec<u8>) -> Result<String> {
    // We isolate the non-Send objects into a scoped block to ensure they don't cross await points
    // if possible, but the Windows async operations themselves return futures.
    // To solve the Send requirement of Axum handlers, we can use a dedicated task
    // or ensure all non-Send values are dropped.

    let stream = InMemoryRandomAccessStream::new()?;
    
    // Fill the stream
    {
        let writer = DataWriter::CreateDataWriter(&stream.GetOutputStreamAt(0)?)?;
        writer.WriteBytes(&data[..])?;
        writer.StoreAsync()?.await?;
        writer.FlushAsync()?.await?;
        // writer and its internal output stream are dropped here
    }

    // Decode and Recognize
    let engine = OcrEngine::TryCreateFromUserProfileLanguages()?;
    
    // We must ensure the decoder/bitmap don't leak into the future's state across other awaits
    let decoder = BitmapDecoder::CreateAsync(&stream)?.await?;
    let bitmap = decoder.GetSoftwareBitmapAsync()?.await?;
    
    if let Ok(result) = engine.RecognizeAsync(&bitmap)?.await {
        return Ok(result.Text()?.to_string());
    }

    Ok(String::new())
}
