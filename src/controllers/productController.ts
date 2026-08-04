import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { instagramService } from '../services/instagramService';

const prisma = new PrismaClient();

export const getProducts = async (req: Request, res: Response) => {
  try {
    const products = await prisma.product.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Error al obtener los productos' });
  }
};

export const createProduct = async (req: Request, res: Response) => {
  try {
    const { name, description, price } = req.body;
    
    // multer adds `file` object to req
    const file = (req as any).file;

    if (!name || !price || !file) {
      return res.status(400).json({ error: 'Nombre, precio e imagen son obligatorios' });
    }

    // Convert price to float
    const parsedPrice = parseFloat(price);

    // Save product
    const imageUrl = `/uploads/${file.filename}`; // This path assumes Express is serving static files from /public

    const newProduct = await prisma.product.create({
      data: {
        name,
        description: description || '',
        price: parsedPrice,
        imageUrl,
      }
    });

    res.status(201).json(newProduct);
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ error: 'Error al crear el producto' });
  }
};

export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    await prisma.product.delete({
      where: { id }
    });

    res.json({ message: 'Producto eliminado correctamente' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Error al eliminar el producto' });
  }
};

export const updateProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, price } = req.body;
    
    // multer adds `file` object to req optionally
    const file = (req as any).file;
    const parsedPrice = price ? parseFloat(price) : undefined;

    const data: any = {};
    if (name) data.name = name;
    if (description !== undefined) data.description = description;
    if (parsedPrice) data.price = parsedPrice;
    if (file) {
      data.imageUrl = `/uploads/${file.filename}`;
    }

    const updatedProduct = await prisma.product.update({
      where: { id },
      data
    });

    res.json(updatedProduct);
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Error al actualizar el producto' });
  }
};

export const publishToInstagram = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { isStory } = req.body; // true for story, false for feed

    const product = await prisma.product.findUnique({ where: { id } });

    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    // Construimos la URL completa para Instagram
    // Como mencionaste que el servidor tiene un dominio público, usamos req.get('host') o una env var.
    const baseUrl = process.env.PUBLIC_DOMAIN || `${req.protocol}://${req.get('host')}`;
    const fullImageUrl = `${baseUrl}${product.imageUrl}`;

    const caption = `🔥 ${product.name} 🔥\n\n${product.description}\n\nPrecio: $${product.price}`;

    await instagramService.publishImage(fullImageUrl, caption, isStory);

    // Update product to mark as published
    const updatedProduct = await prisma.product.update({
      where: { id },
      data: { isPublished: true }
    });

    res.json({ message: 'Publicado correctamente en Instagram', product: updatedProduct });
  } catch (error: any) {
    console.error('Error publishing to Instagram:', error);
    res.status(500).json({ error: error.message || 'Error al publicar en Instagram' });
  }
};
