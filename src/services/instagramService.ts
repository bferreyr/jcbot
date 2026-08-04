import fs from 'fs';

// Constants for Instagram API.
// In a real scenario, you'd get these from the database or .env
const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN || '';
const IG_USER_ID = process.env.IG_USER_ID || '';
const IG_GRAPH_API_URL = 'https://graph.facebook.com/v19.0';

export class InstagramService {
  /**
   * Publishes a photo to the Instagram Feed or Story
   * @param imageUrl Public URL of the image to publish
   * @param caption The caption text
   * @param isStory True for story, false for feed
   */
  async publishImage(imageUrl: string, caption: string, isStory: boolean = false): Promise<any> {
    if (!IG_ACCESS_TOKEN || !IG_USER_ID) {
      throw new Error('Las credenciales de Instagram no están configuradas en el entorno (IG_ACCESS_TOKEN o IG_USER_ID).');
    }

    try {
      // Step 1: Create a media container
      let createMediaUrl = `${IG_GRAPH_API_URL}/${IG_USER_ID}/media`;
      
      const params = new URLSearchParams();
      params.append('image_url', imageUrl);
      params.append('access_token', IG_ACCESS_TOKEN);

      if (isStory) {
        params.append('media_type', 'STORIES');
      } else {
        params.append('caption', caption);
      }

      console.log('Creando contenedor de medios en Instagram...', { imageUrl, isStory });
      
      const createResponse = await fetch(`${createMediaUrl}?${params.toString()}`, {
        method: 'POST',
      });
      
      const createData = await createResponse.json();
      
      if (!createResponse.ok) {
        throw new Error(`Error creando media: ${JSON.stringify(createData)}`);
      }

      const creationId = createData.id;
      if (!creationId) {
        throw new Error('No se recibió el ID de creación de Instagram.');
      }

      // Step 2: Publish the media container
      console.log(`Publicando contenedor de medios ${creationId}...`);
      
      const publishUrl = `${IG_GRAPH_API_URL}/${IG_USER_ID}/media_publish`;
      const publishParams = new URLSearchParams();
      publishParams.append('creation_id', creationId);
      publishParams.append('access_token', IG_ACCESS_TOKEN);

      const publishResponse = await fetch(`${publishUrl}?${publishParams.toString()}`, {
        method: 'POST',
      });

      const publishData = await publishResponse.json();

      if (!publishResponse.ok) {
        throw new Error(`Error publicando media: ${JSON.stringify(publishData)}`);
      }

      return publishData;
    } catch (error: any) {
      console.error('Error en InstagramService.publishImage:', error.message || error);
      throw error;
    }
  }
}

export const instagramService = new InstagramService();
